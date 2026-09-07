' Spares pack helper for SolidWorks.
' Tools → Macro → New, paste, run on the open assembly.
' Sets each component name to the file PartNumber (or file name).
' Then: File → Save As → glTF Binary (*.glb)
' Total ETO: export the unit BOM CSV and upload both files together.

Option Explicit

Sub main()
    Dim swApp As SldWorks.SldWorks
    Dim swModel As SldWorks.ModelDoc2
    Dim swAssy As SldWorks.AssemblyDoc
    Dim comps As Variant
    Dim i As Long
    Dim comp As SldWorks.Component2
    Dim child As SldWorks.ModelDoc2
    Dim pn As String

    Set swApp = Application.SldWorks
    Set swModel = swApp.ActiveDoc
    If swModel Is Nothing Then Exit Sub
    If swModel.GetType <> swDocASSEMBLY Then
        swApp.SendMsgToUser2 "Open an assembly first.", swMbWarning, swMbOk
        Exit Sub
    End If

    Set swAssy = swModel
    comps = swAssy.GetComponents(False)
    If IsEmpty(comps) Then Exit Sub

    For i = 0 To UBound(comps)
        Set comp = comps(i)
        If Not comp Is Nothing Then
            If Not comp.IsSuppressed Then
                Set child = comp.GetModelDoc2
                pn = ""
                If Not child Is Nothing Then
                    pn = child.GetCustomInfoValue("", "PartNumber")
                    If Len(Trim(pn)) = 0 Then
                        pn = child.GetCustomInfoValue("", "Number")
                    End If
                    If Len(Trim(pn)) = 0 Then
                        pn = child.GetTitle
                    End If
                End If
                pn = Trim(pn)
                If Len(pn) > 0 Then
                    comp.Name2 = pn
                End If
            End If
        End If
    Next i

    swModel.ForceRebuild3 False
    swApp.SendMsgToUser2 "Component names set to part numbers. Save As GLB, then upload with the ETO CSV.", swMbInformation, swMbOk
End Sub
