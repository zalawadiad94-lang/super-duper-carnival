//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"syscall"
	"unsafe"

	"github.com/jchv/go-webview2"
)

func init() {
	// WebView2 must run on the thread that created the window.
	runtime.LockOSThread()
}

// showWindow opens the app in its own window and returns when it is closed.
// Order: WebView2 (built into Windows 10/11) → Edge app window → default browser.
func showWindow(url, dataPath string) {
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		AutoFocus: true,
		DataPath:  dataPath,
		WindowOptions: webview2.WindowOptions{
			Title:  "Sitekhata",
			Width:  1280,
			Height: 820,
			IconId: 1,
			Center: true,
		},
	})
	if w != nil {
		defer w.Destroy()
		w.Navigate(url)
		w.Run()
		return
	}
	if edge := findEdge(); edge != "" {
		cmd := exec.Command(edge, "--app="+url, "--user-data-dir="+dataPath+"-edge",
			"--no-first-run", "--no-default-browser-check", "--window-size=1280,820")
		if err := cmd.Run(); err == nil {
			return
		}
	}
	_ = openExternal(url)
	showMessage("Sitekhata", "Sitekhata is open in your web browser.\n\nKeep this box open while you use it (and while your phone syncs). Click OK to close Sitekhata.")
}

func findEdge() string {
	for _, base := range []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LocalAppData")} {
		if base == "" {
			continue
		}
		p := filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe")
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// openExternal opens a link (WhatsApp, phone, website) in the PC's default app.
func openExternal(url string) error {
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Start()
}

func showMessage(title, text string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	box := user32.NewProc("MessageBoxW")
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(text)
	_, _, _ = box.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), 0x40) // MB_ICONINFORMATION
}
