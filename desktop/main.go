// Sitekhata for PC.
//
// One .exe that serves the Sitekhata web app (embedded from web/) to its own
// window and is the sync hub for the phone app: it keeps the master copy of
// the books in %APPDATA%\Sitekhata\books.json and answers phones on the
// Wi-Fi at http://<pc-ip>:47615, protected by a 6-digit pairing code.
//
// Merging happens in the app (src/lib/sync.ts); this server only stores the
// merged books with a revision number, so two devices can't overwrite each
// other (PUT with an old revision gets 409 and the device merges again).
package main

import (
	"bytes"
	"crypto/rand"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"math/big"
	"mime"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const version = "2.9"

// port the app listens on (all interfaces). SITEKHATA_PORT overrides it,
// e.g. to run two PCs' worth of Sitekhata on one machine for testing.
var port = 47615

//go:embed all:web
var webFiles embed.FS

type store struct {
	mu  sync.Mutex
	dir string
	key string
	// main is the main PC's address when this PC is linked to another one
	// ("" = this PC is the main one, the hub phones connect to).
	main    string
	rev     int64
	doc     json.RawMessage
	devices map[string]device
}

type device struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	IP       string `json:"ip"`
	LastSeen int64  `json:"lastSeen"`
}

type saved struct {
	Rev int64           `json:"rev"`
	Doc json.RawMessage `json:"doc"`
}

func dataDir() string {
	base, err := os.UserConfigDir()
	if err != nil {
		base = "."
	}
	dir := filepath.Join(base, "Sitekhata")
	_ = os.MkdirAll(filepath.Join(dir, "backups"), 0o755)
	return dir
}

func newCode() string {
	n, err := rand.Int(rand.Reader, big.NewInt(900000))
	if err != nil {
		return "482913"
	}
	return fmt.Sprintf("%06d", n.Int64()+100000)
}

func openStore(dir string) *store {
	s := &store{dir: dir, devices: map[string]device{}}
	var cfg config
	if raw, err := os.ReadFile(filepath.Join(dir, "config.json")); err == nil {
		_ = json.Unmarshal(raw, &cfg)
	}
	s.key, s.main = cfg.Key, cfg.Main
	if len(s.key) != 6 {
		s.key = newCode()
		s.saveConfig()
	}
	if raw, err := os.ReadFile(filepath.Join(dir, "books.json")); err == nil {
		var sv saved
		if json.Unmarshal(raw, &sv) == nil {
			s.rev, s.doc = sv.Rev, sv.Doc
		}
	}
	return s
}

type config struct {
	Key  string `json:"key"`
	Main string `json:"main,omitempty"`
}

func (s *store) saveConfig() {
	raw, _ := json.Marshal(config{Key: s.key, Main: s.main})
	_ = os.WriteFile(filepath.Join(s.dir, "config.json"), raw, 0o600)
}

// save writes books.json atomically and keeps one backup per day (last 30).
func (s *store) save() error {
	raw, err := json.Marshal(saved{Rev: s.rev, Doc: s.doc})
	if err != nil {
		return err
	}
	tmp := filepath.Join(s.dir, "books.json.tmp")
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, filepath.Join(s.dir, "books.json")); err != nil {
		return err
	}
	backups := filepath.Join(s.dir, "backups")
	_ = os.WriteFile(filepath.Join(backups, "books-"+time.Now().Format("2006-01-02")+".json"), raw, 0o600)
	if entries, err := os.ReadDir(backups); err == nil && len(entries) > 30 {
		names := make([]string, 0, len(entries))
		for _, e := range entries {
			names = append(names, e.Name())
		}
		sort.Strings(names)
		for _, name := range names[:len(names)-30] {
			_ = os.Remove(filepath.Join(backups, name))
		}
	}
	return nil
}

func isLoopback(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return false
	}
	ip := net.ParseIP(host)
	if ip == nil || !ip.IsLoopback() {
		return false
	}
	// Guard against DNS rebinding: the PC window always uses 127.0.0.1.
	h := r.Host
	return h == fmt.Sprintf("127.0.0.1:%d", port) || h == fmt.Sprintf("localhost:%d", port)
}

// lanAddresses lists this PC's private IPv4 addresses (what the phone types).
func lanAddresses() []string {
	out := []string{}
	ifaces, err := net.Interfaces()
	if err != nil {
		return out
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := iface.Addrs()
		for _, a := range addrs {
			ipnet, ok := a.(*net.IPNet)
			if !ok {
				continue
			}
			ip := ipnet.IP.To4()
			if ip == nil || !ip.IsPrivate() {
				continue
			}
			out = append(out, ip.String())
		}
	}
	sort.Strings(out)
	return out
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func (s *store) authorized(r *http.Request) bool {
	return isLoopback(r) || r.Header.Get("X-Sitekhata-Key") == s.key
}

func (s *store) seen(r *http.Request) {
	name, id, ok := strings.Cut(r.Header.Get("X-Sitekhata-Device"), "|")
	if !ok || id == "" {
		return
	}
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	if len(name) > 40 {
		name = name[:40]
	}
	if len(id) > 64 {
		id = id[:64]
	}
	s.devices[id] = device{ID: id, Name: name, IP: host, LastSeen: time.Now().UnixMilli()}
}

func (s *store) handleBooks(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "wrong pairing code"})
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.main != "" && !isLoopback(r) {
		// This PC is linked to a main PC: devices must sync with that one.
		writeJSON(w, http.StatusMisdirectedRequest, map[string]string{"error": "linked", "main": s.main})
		return
	}
	s.seen(r)
	switch r.Method {
	case http.MethodGet:
		doc := s.doc
		if len(doc) == 0 {
			doc = json.RawMessage("null")
		}
		writeJSON(w, http.StatusOK, map[string]any{"rev": s.rev, "doc": doc})
	case http.MethodPut:
		var body struct {
			BaseRev int64           `json:"baseRev"`
			Doc     json.RawMessage `json:"doc"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 50<<20)).Decode(&body); err != nil || len(body.Doc) == 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad books"})
			return
		}
		if body.BaseRev != s.rev {
			doc := s.doc
			if len(doc) == 0 {
				doc = json.RawMessage("null")
			}
			writeJSON(w, http.StatusConflict, map[string]any{"rev": s.rev, "doc": doc})
			return
		}
		s.rev++
		s.doc = body.Doc
		if err := s.save(); err != nil {
			log.Printf("save: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not save on the PC"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"rev": s.rev})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *store) handlePairing(w http.ResponseWriter, r *http.Request) {
	if !isLoopback(r) {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	devices := make([]device, 0, len(s.devices))
	for _, d := range s.devices {
		devices = append(devices, d)
	}
	sort.Slice(devices, func(i, j int) bool { return devices[i].LastSeen > devices[j].LastSeen })
	hostname, _ := os.Hostname()
	writeJSON(w, http.StatusOK, map[string]any{
		"key":       s.key,
		"name":      hostname,
		"port":      port,
		"addresses": lanAddresses(),
		"devices":   devices,
		"main":      s.main,
	})
}

// handleRole: the PC window says whether this PC is the main one or linked
// to another PC (address in "main").
func (s *store) handleRole(w http.ResponseWriter, r *http.Request) {
	if !isLoopback(r) || r.Method != http.MethodPost {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	var body struct {
		Main string `json:"main"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<12)).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	s.main = strings.TrimSpace(body.Main)
	s.saveConfig()
	s.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func handleOpen(w http.ResponseWriter, r *http.Request) {
	if !isLoopback(r) || r.Method != http.MethodPost {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	var body struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	lower := strings.ToLower(body.URL)
	allowed := false
	for _, scheme := range []string{"https://", "http://", "tel:", "sms:", "mailto:", "whatsapp:"} {
		if strings.HasPrefix(lower, scheme) {
			allowed = true
		}
	}
	if !allowed {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if err := openExternal(body.URL); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// staticHandler serves the app to the PC window. Every app route gets
// index.html, marked as the desktop app so the page acts as the sync hub.
func staticHandler() http.Handler {
	sub, err := fs.Sub(webFiles, "web")
	if err != nil {
		log.Fatal(err)
	}
	index, err := fs.ReadFile(sub, "index.html")
	if err != nil {
		log.Fatal("web/index.html missing: build the web app first")
	}
	marked := bytes.Replace(index, []byte("</head>"),
		[]byte("<script>window.__SITEKHATA_DESKTOP__=true</script></head>"), 1)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !isLoopback(r) {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			_, _ = io.WriteString(w, "Sitekhata PC is running. Connect from the Sitekhata app on your phone: Phone & PC sync.\n")
			return
		}
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if p != "" && p != "index.html" && strings.Contains(path.Base(p), ".") {
			data, err := fs.ReadFile(sub, p)
			if err != nil {
				http.NotFound(w, r)
				return
			}
			if ct := mime.TypeByExtension(path.Ext(p)); ct != "" {
				w.Header().Set("Content-Type", ct)
			}
			if strings.HasPrefix(p, "assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			_, _ = w.Write(data)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(marked)
	})
}

// cors lets the app in a phone browser reach the hub too (the key still guards the books).
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/books") || r.URL.Path == "/api/hello" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Sitekhata-Key, X-Sitekhata-Device")
			w.Header().Set("Access-Control-Allow-Private-Network", "true")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func newServer(s *store) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/hello", func(w http.ResponseWriter, r *http.Request) {
		hostname, _ := os.Hostname()
		s.mu.Lock()
		main := s.main
		s.mu.Unlock()
		writeJSON(w, http.StatusOK, map[string]string{"app": "sitekhata", "name": hostname, "version": version, "main": main})
	})
	mux.HandleFunc("/api/role", s.handleRole)
	mux.HandleFunc("/api/books", s.handleBooks)
	mux.HandleFunc("/api/pairing", s.handlePairing)
	mux.HandleFunc("/api/open", handleOpen)
	mux.Handle("/", staticHandler())
	return cors(mux)
}

// alreadyRunning: is Sitekhata itself holding the port?
func alreadyRunning() bool {
	client := http.Client{Timeout: 2 * time.Second}
	res, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/api/hello", port))
	if err != nil {
		return false
	}
	defer res.Body.Close()
	var info struct {
		App string `json:"app"`
	}
	return json.NewDecoder(res.Body).Decode(&info) == nil && info.App == "sitekhata"
}

func main() {
	if p, err := strconv.Atoi(os.Getenv("SITEKHATA_PORT")); err == nil && p > 0 && p < 65536 {
		port = p
	}
	dir := dataDir()
	logFile, err := os.OpenFile(filepath.Join(dir, "sitekhata.log"), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err == nil {
		log.SetOutput(logFile)
	}
	appURL := fmt.Sprintf("http://127.0.0.1:%d/", port)

	ln, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", port))
	if err != nil {
		if alreadyRunning() {
			// A second double-click: open another window on the running app.
			showWindow(appURL, filepath.Join(dir, "window2"))
			return
		}
		showMessage("Sitekhata", fmt.Sprintf("Sitekhata could not start: port %d is used by another program.\n\n%v", port, err))
		return
	}
	s := openStore(dir)
	srv := &http.Server{Handler: newServer(s), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("server: %v", err)
		}
	}()
	log.Printf("Sitekhata %s at %s, data in %s", version, appURL, dir)
	showWindow(appURL, filepath.Join(dir, "window"))
	_ = srv.Close()
}
