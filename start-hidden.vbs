Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = root

If WScript.Arguments.Count > 0 Then
  node = WScript.Arguments(0)
Else
  node = "node"
End If

sh.Run """" & node & """ server.mjs", 0, False
