' Abre o Projecao Assembleia sem mostrar a janela preta do prompt
Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
sh.CurrentDirectory = fs.GetParentFolderName(WScript.ScriptFullName)
sh.Run "cmd /c npx electron .", 0, False
