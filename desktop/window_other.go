//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/signal"
)

// Non-Windows builds (development / testing): serve until Ctrl+C.
func showWindow(url, _ string) {
	fmt.Println("Sitekhata running at", url)
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	<-stop
}

func openExternal(url string) error {
	fmt.Println("open:", url)
	return nil
}

func showMessage(title, text string) {
	fmt.Println(title+":", text)
}
