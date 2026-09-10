Option Explicit
Dim sh, fso, url, chrome, candidates, i, logPath, ok
url = "http://127.0.0.1:8787/"
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
logPath = fso.GetParentFolderName(WScript.ScriptFullName) & "\start.log"

Sub WriteLog(msg)
  Dim ts
  On Error Resume Next
  Set ts = fso.OpenTextFile(logPath, 8, True)
  ts.WriteLine Now & " " & msg
  ts.Close
End Sub

Function RegChrome(key)
  On Error Resume Next
  Err.Clear
  RegChrome = Trim(sh.RegRead(key))
  If Err.Number <> 0 Then
    Err.Clear
    RegChrome = ""
  End If
End Function

WriteLog "Opening " & url
chrome = RegChrome("HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe\")
If chrome = "" Then chrome = RegChrome("HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe\")
If chrome = "" Then chrome = RegChrome("HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe\")

candidates = Array( _
  chrome, _
  sh.ExpandEnvironmentStrings("%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"), _
  sh.ExpandEnvironmentStrings("%ProgramFiles%\Google\Chrome\Application\chrome.exe"), _
  sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe") _
)

ok = False
For i = 0 To UBound(candidates)
  chrome = Trim(Replace(candidates(i) & "", """", ""))
  If chrome <> "" Then
    If fso.FileExists(chrome) Then
      WriteLog "Found Chrome: " & chrome
      On Error Resume Next
      Err.Clear
      sh.Run """" & chrome & """ """ & url & """", 1, False
      If Err.Number = 0 Then
        ok = True
        WriteLog "Launched Chrome with " & url
      Else
        WriteLog "Chrome launch failed: " & Err.Description
        Err.Clear
      End If
      On Error GoTo 0
      If ok Then Exit For
    End If
  End If
Next

If Not ok Then
  WriteLog "Chrome not found, falling back to default browser"
  On Error Resume Next
  Err.Clear
  sh.Run "cmd /c start """" """ & url & """", 0, False
  If Err.Number = 0 Then
    ok = True
    WriteLog "Opened default browser with " & url
  Else
    WriteLog "Default browser failed: " & Err.Description
  End If
End If

If ok Then
  WScript.Quit 0
Else
  WScript.Quit 1
End If
