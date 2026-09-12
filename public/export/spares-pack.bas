' Spares pack export for SolidWorks assemblies.
' Tools → Macro → New, paste this module, run main on the open assembly.
' Writes parts JSON + CSV next to the assembly, renames leaf parts to
' PartNumber-1 / PartNumber-2 so GLB node names match meshName, and attempts
' a GLB export when the installed SolidWorks build supports it.

Option Explicit

Private Const OUTPUT_JSON_SUFFIX As String = "-spares-parts.json"
Private Const OUTPUT_CSV_SUFFIX As String = "-spares-parts.csv"

' ---- string helpers ----

Private Function JsonEscape(ByVal value As String) As String
    Dim i As Long
    Dim ch As String
    Dim out As String
    out = ""
    For i = 1 To Len(value)
        ch = Mid$(value, i, 1)
        Select Case ch
            Case """"
                out = out & "\"""
            Case "\"
                out = out & "\\"
            Case vbCr
                out = out & "\r"
            Case vbLf
                out = out & "\n"
            Case vbTab
                out = out & "\t"
            Case Else
                If AscW(ch) < 32 Then
                    out = out & " "
                Else
                    out = out & ch
                End If
        End Select
    Next i
    JsonEscape = out
End Function

Private Function CsvEscape(ByVal value As String) As String
    If InStr(value, """") > 0 Or InStr(value, ",") > 0 Or InStr(value, vbCr) > 0 Or InStr(value, vbLf) > 0 Then
        CsvEscape = """" & Replace(value, """", """""") & """"
    Else
        CsvEscape = value
    End If
End Function

Private Function TrimAll(ByVal value As String) As String
    TrimAll = Trim$(Replace$(Replace$(value, vbCr, " "), vbLf, " "))
End Function

Private Function SanitizeMeshName(ByVal value As String) As String
    Dim i As Long
    Dim ch As String
    Dim out As String
    out = ""
    For i = 1 To Len(value)
        ch = Mid$(value, i, 1)
        Select Case ch
            Case "A" To "Z", "a" To "z", "0" To "9", "-", "_", "."
                out = out & ch
            Case " ", "/", "\", ":"
                If Len(out) > 0 And Right$(out, 1) <> "-" Then
                    out = out & "-"
                End If
            Case Else
                ' drop other punctuation
        End Select
    Next i
    SanitizeMeshName = TrimAll(Replace$(out, "--", "-"))
End Function

Private Function FileNameWithoutExt(ByVal pathOrName As String) As String
    Dim base As String
    Dim pos As Long
    base = pathOrName
    pos = InStrRev(base, "\")
    If pos > 0 Then
        base = Mid$(base, pos + 1)
    End If
    pos = InStrRev(base, ".")
    If pos > 1 Then
        base = Left$(base, pos - 1)
    End If
    FileNameWithoutExt = base
End Function

Private Function FolderPath(ByVal filePath As String) As String
    Dim pos As Long
    pos = InStrRev(filePath, "\")
    If pos > 0 Then
        FolderPath = Left$(filePath, pos - 1)
    Else
        FolderPath = ""
    End If
End Function

' ---- property + part-number resolution ----

Private Function GetCustomProp(ByVal doc As SldWorks.ModelDoc2, ByVal propName As String) As String
    Dim cfg As String
    On Error Resume Next
    GetCustomProp = TrimAll(doc.GetCustomInfoValue("", propName))
    If Len(GetCustomProp) = 0 Then
        cfg = doc.ConfigurationManager.ActiveConfiguration.Name
        GetCustomProp = TrimAll(doc.GetCustomInfoValue(cfg, propName))
    End If
    On Error GoTo 0
End Function

Private Function FirstNonEmpty(ByParamArray values() As Variant) As String
    Dim i As Long
    For i = LBound(values) To UBound(values)
        If Len(TrimAll(CStr(values(i)))) > 0 Then
            FirstNonEmpty = TrimAll(CStr(values(i)))
            Exit Function
        End If
    Next i
    FirstNonEmpty = ""
End Function

Private Function LooksLikeMcMasterSku(ByVal value As String) As Boolean
    Dim i As Long
    Dim ch As String
    Dim digitsBefore As Long
    Dim letterSeen As Boolean
    Dim tail As Long
    value = TrimAll(value)
    If Len(value) < 6 Or Len(value) > 12 Then
        LooksLikeMcMasterSku = False
        Exit Function
    End If
    digitsBefore = 0
    letterSeen = False
    tail = 0
    For i = 1 To Len(value)
        ch = Mid$(value, i, 1)
        If Not letterSeen Then
            If ch >= "0" And ch <= "9" Then
                digitsBefore = digitsBefore + 1
            ElseIf ch >= "A" And ch <= "Z" Then
                letterSeen = True
            Else
                LooksLikeMcMasterSku = False
                Exit Function
            End If
        Else
            If (ch >= "0" And ch <= "9") Or (ch >= "A" And ch <= "Z") Then
                tail = tail + 1
            Else
                LooksLikeMcMasterSku = False
                Exit Function
            End If
        End If
    Next i
    LooksLikeMcMasterSku = (digitsBefore >= 4 And digitsBefore <= 5 And letterSeen And tail >= 2)
End Function

Private Function SkuFromFileName(ByVal filePath As String) As String
    Dim base As String
    base = FileNameWithoutExt(filePath)
    If LooksLikeMcMasterSku(base) Then
        SkuFromFileName = base
    Else
        SkuFromFileName = ""
    End If
End Function

Private Function ResolvePartNumber(ByVal comp As SldWorks.Component2, ByVal child As SldWorks.ModelDoc2) As String
    Dim pn As String
    Dim filePath As String
    pn = ""
    If Not child Is Nothing Then
        pn = FirstNonEmpty( _
            GetCustomProp(child, "PartNumber"), _
            GetCustomProp(child, "Number"), _
            GetCustomProp(child, "Part No"), _
            GetCustomProp(child, "PartNo"), _
            GetCustomProp(child, "PN"))
        filePath = child.GetPathName
        If Len(pn) = 0 And Len(filePath) > 0 Then
            pn = SkuFromFileName(filePath)
        End If
        If Len(pn) = 0 Then
            pn = FileNameWithoutExt(child.GetTitle)
        End If
    End If
    If Len(pn) = 0 Then
        pn = FileNameWithoutExt(comp.Name2)
    End If
    ResolvePartNumber = SanitizeMeshName(pn)
End Function

Private Function ResolveDescription(ByVal comp As SldWorks.Component2, ByVal child As SldWorks.ModelDoc2, ByVal partNumber As String) As String
    Dim desc As String
    desc = ""
    If Not child Is Nothing Then
        desc = FirstNonEmpty( _
            GetCustomProp(child, "Description"), _
            GetCustomProp(child, "Desc"), _
            GetCustomProp(child, "Name"), _
            child.ConfigurationManager.ActiveConfiguration.Name, _
            FileNameWithoutExt(child.GetTitle))
    End If
    If Len(desc) = 0 Then
        desc = partNumber
    End If
    If Len(desc) = 0 Then
        desc = comp.Name2
    End If
    ResolveDescription = TrimAll(desc)
End Function

Private Function ResolveVendor(ByVal child As SldWorks.ModelDoc2) As String
    If child Is Nothing Then
        ResolveVendor = ""
        Exit Function
    End If
    ResolveVendor = FirstNonEmpty( _
        GetCustomProp(child, "Vendor"), _
        GetCustomProp(child, "Manufacturer"), _
        GetCustomProp(child, "Supplier"), _
        GetCustomProp(child, "Mfr"))
End Function

' SolidWorks Name2 / glTF nodes use PartNumber-1, PartNumber-2, ...
Private Function NextInstanceMeshName(ByVal partNumber As String, ByRef used As Object, ByRef counts As Object) As String
    Dim n As Long
    Dim candidate As String
    If Len(partNumber) = 0 Then
        partNumber = "Part"
    End If
    If counts.Exists(partNumber) Then
        n = CLng(counts(partNumber)) + 1
    Else
        n = 1
    End If
    Do
        candidate = partNumber & "-" & CStr(n)
        If Not used.Exists(candidate) Then
            Exit Do
        End If
        n = n + 1
    Loop
    counts(partNumber) = n
    used.Add candidate, 1
    NextInstanceMeshName = candidate
End Function

Private Function SkipComponent(ByVal comp As SldWorks.Component2) As Boolean
    Dim envelope As Boolean
    On Error Resume Next
    If comp.IsSuppressed Then
        SkipComponent = True
        Exit Function
    End If
    envelope = comp.IsEnvelope
    If Err.Number = 0 And envelope Then
        SkipComponent = True
        Exit Function
    End If
    Err.Clear
    On Error GoTo 0
    SkipComponent = False
End Function

Private Function IsAssemblyDoc(ByVal child As SldWorks.ModelDoc2) As Boolean
    On Error Resume Next
    If child Is Nothing Then
        IsAssemblyDoc = False
        Exit Function
    End If
    IsAssemblyDoc = (child.GetType = swDocASSEMBLY)
    On Error GoTo 0
End Function

Private Function ApplyComponentName(ByVal comp As SldWorks.Component2, ByVal desired As String) As String
    Dim actual As String
    On Error Resume Next
    If comp.Name2 <> desired Then
        comp.Name2 = desired
    End If
    actual = TrimAll(comp.Name2)
    On Error GoTo 0
    If Len(actual) > 0 Then
        ApplyComponentName = actual
    Else
        ApplyComponentName = desired
    End If
End Function

' ---- manifest rows ----

Private Type SparesPartRow
    partNumber As String
    name As String
    meshName As String
    qty As Long
    vendor As String
End Type

Private Sub CollapseRowsByPartNumber(ByRef rows() As SparesPartRow, ByRef count As Long)
    Dim collapsed() As SparesPartRow
    Dim n As Long
    Dim i As Long
    Dim seen As Object
    Dim idx As Long
    If count < 1 Then Exit Sub
    Set seen = CreateObject("Scripting.Dictionary")
    seen.CompareMode = 1
    n = 0
    For i = 1 To count
        If seen.Exists(rows(i).partNumber) Then
            idx = CLng(seen(rows(i).partNumber))
            collapsed(idx).qty = collapsed(idx).qty + rows(i).qty
        Else
            n = n + 1
            If n = 1 Then
                ReDim collapsed(1 To 1)
            Else
                ReDim Preserve collapsed(1 To n)
            End If
            collapsed(n) = rows(i)
            seen.Add rows(i).partNumber, n
        End If
    Next i
    rows = collapsed
    count = n
End Sub

Private Function AppendRow(ByRef rows() As SparesPartRow, ByRef count As Long, ByVal row As SparesPartRow) As Long
    count = count + 1
    If count = 1 Then
        ReDim rows(1 To 1)
    Else
        ReDim Preserve rows(1 To count)
    End If
    rows(count) = row
    AppendRow = count
End Function

Private Sub SortRows(ByRef rows() As SparesPartRow, ByVal count As Long)
    Dim i As Long, j As Long
    Dim tmp As SparesPartRow
    If count < 2 Then Exit Sub
    For i = 1 To count - 1
        For j = i + 1 To count
            If StrComp(rows(j).partNumber, rows(i).partNumber, vbTextCompare) < 0 _
                Or (StrComp(rows(j).partNumber, rows(i).partNumber, vbTextCompare) = 0 _
                    And StrComp(rows(j).meshName, rows(i).meshName, vbTextCompare) < 0) Then
                tmp = rows(i)
                rows(i) = rows(j)
                rows(j) = tmp
            End If
        Next j
    Next i
End Sub

Private Function WriteJsonManifest(ByVal filePath As String, ByRef rows() As SparesPartRow, ByVal count As Long) As Boolean
    Dim fh As Integer
    Dim i As Long
    On Error GoTo fail
    fh = FreeFile
    Open filePath For Output As #fh
    Print #fh, "["
    For i = 1 To count
        Print #fh, "  {"
        Print #fh, "    ""partNumber"": """ & JsonEscape(rows(i).partNumber) & ""","
        Print #fh, "    ""name"": """ & JsonEscape(rows(i).name) & ""","
        Print #fh, "    ""meshName"": """ & JsonEscape(rows(i).meshName) & ""","
        If Len(rows(i).vendor) > 0 Then
            Print #fh, "    ""qty"": " & CStr(rows(i).qty) & ","
            Print #fh, "    ""vendor"": """ & JsonEscape(rows(i).vendor) & """"
        Else
            Print #fh, "    ""qty"": " & CStr(rows(i).qty)
        End If
        If i < count Then
            Print #fh, "  },"
        Else
            Print #fh, "  }"
        End If
    Next i
    Print #fh, "]"
    Close #fh
    WriteJsonManifest = True
    Exit Function
fail:
    On Error Resume Next
    Close #fh
    WriteJsonManifest = False
End Function

Private Function WriteCsvManifest(ByVal filePath As String, ByRef rows() As SparesPartRow, ByVal count As Long) As Boolean
    Dim fh As Integer
    Dim i As Long
    On Error GoTo fail
    fh = FreeFile
    Open filePath For Output As #fh
    Print #fh, "partNumber,name,meshName,qty,vendor"
    For i = 1 To count
        Print #fh, CsvEscape(rows(i).partNumber) & "," & _
                     CsvEscape(rows(i).name) & "," & _
                     CsvEscape(rows(i).meshName) & "," & _
                     CStr(rows(i).qty) & "," & _
                     CsvEscape(rows(i).vendor)
    Next i
    Close #fh
    WriteCsvManifest = True
    Exit Function
fail:
    On Error Resume Next
    Close #fh
    WriteCsvManifest = False
End Function

' ---- GLB export ----

Private Function TryExportGlb(ByVal swModel As SldWorks.ModelDoc2, ByVal exportPath As String) As Boolean
    Dim ext As SldWorks.ModelDocExtension
    Dim errs As Long
    Dim warns As Long
    Dim ok As Boolean
    On Error GoTo fail
    Set ext = swModel.Extension
    ok = ext.SaveAs(exportPath, swSaveAsCurrentVersion, swSaveAsOptions_Silent, Nothing, errs, warns)
    If ok And Dir$(exportPath) <> "" Then
        TryExportGlb = True
    Else
        TryExportGlb = False
    End If
    Exit Function
fail:
    TryExportGlb = False
End Function

' ---- main ----

Sub main()
    Dim swApp As SldWorks.SldWorks
    Dim swModel As SldWorks.ModelDoc2
    Dim swAssy As SldWorks.AssemblyDoc
    Dim comps As Variant
    Dim i As Long
    Dim comp As SldWorks.Component2
    Dim child As SldWorks.ModelDoc2
    Dim assyPath As String
    Dim outFolder As String
    Dim baseName As String
    Dim jsonPath As String
    Dim csvPath As String
    Dim glbPath As String
    Dim usedNames As Object
    Dim instanceCounts As Object
    Dim rows() As SparesPartRow
    Dim row As SparesPartRow
    Dim rowCount As Long
    Dim partNumber As String
    Dim meshName As String
    Dim renamed As Long
    Dim glbOk As Boolean
    Dim msg As String

    Set swApp = Application.SldWorks
    Set swModel = swApp.ActiveDoc
    If swModel Is Nothing Then
        swApp.SendMsgToUser2 "Open an assembly first.", swMbWarning, swMbOk
        Exit Sub
    End If
    If swModel.GetType <> swDocASSEMBLY Then
        swApp.SendMsgToUser2 "Open an assembly first.", swMbWarning, swMbOk
        Exit Sub
    End If

    assyPath = swModel.GetPathName
    If Len(Trim$(assyPath)) = 0 Then
        swApp.SendMsgToUser2 "Save the assembly first so the pack can be written next to it.", swMbWarning, swMbOk
        Exit Sub
    End If

    Set swAssy = swModel
    On Error Resume Next
    Call swAssy.ResolveAllLightWeightComponents(True)
    On Error GoTo 0
    ' False = every component, including parts inside subassemblies.
    comps = swAssy.GetComponents(False)
    If IsEmpty(comps) Then
        swApp.SendMsgToUser2 "This assembly has no components.", swMbWarning, swMbOk
        Exit Sub
    End If

    Set usedNames = CreateObject("Scripting.Dictionary")
    usedNames.CompareMode = 1 ' TextCompare
    Set instanceCounts = CreateObject("Scripting.Dictionary")
    instanceCounts.CompareMode = 1
    rowCount = 0
    renamed = 0

    For i = 0 To UBound(comps)
        Set comp = comps(i)
        If comp Is Nothing Then GoTo NextComp
        If SkipComponent(comp) Then GoTo NextComp

        Set child = comp.GetModelDoc2
        If IsAssemblyDoc(child) Then GoTo NextComp

        partNumber = ResolvePartNumber(comp, child)
        If Len(partNumber) = 0 Then GoTo NextComp

        meshName = NextInstanceMeshName(partNumber, usedNames, instanceCounts)
        If comp.Name2 <> meshName Then
            renamed = renamed + 1
        End If
        meshName = ApplyComponentName(comp, meshName)

        row.partNumber = partNumber
        row.name = ResolveDescription(comp, child, partNumber)
        row.meshName = meshName
        row.qty = 1
        row.vendor = ResolveVendor(child)
        Call AppendRow(rows, rowCount, row)
NextComp:
    Next i

    If rowCount = 0 Then
        swApp.SendMsgToUser2 "No unsuppressed parts with a part number were found.", swMbWarning, swMbOk
        Exit Sub
    End If

    CollapseRowsByPartNumber rows, rowCount
    SortRows rows, rowCount
    swModel.ForceRebuild3 False

    outFolder = FolderPath(assyPath)
    baseName = FileNameWithoutExt(assyPath)
    jsonPath = outFolder & "\" & baseName & OUTPUT_JSON_SUFFIX
    csvPath = outFolder & "\" & baseName & OUTPUT_CSV_SUFFIX
    glbPath = outFolder & "\" & baseName & ".glb"

    If Not WriteJsonManifest(jsonPath, rows, rowCount) Then
        swApp.SendMsgToUser2 "Could not write " & jsonPath, swMbStop, swMbOk
        Exit Sub
    End If
    If Not WriteCsvManifest(csvPath, rows, rowCount) Then
        swApp.SendMsgToUser2 "Could not write " & csvPath, swMbStop, swMbOk
        Exit Sub
    End If

    glbOk = TryExportGlb(swModel, glbPath)

    msg = "Spares pack ready in:" & vbCrLf & outFolder & vbCrLf & vbCrLf
    msg = msg & "Parts list (" & CStr(rowCount) & " part numbers, " & CStr(renamed) & " instances renamed):" & vbCrLf
    msg = msg & "  " & baseName & OUTPUT_JSON_SUFFIX & vbCrLf
    msg = msg & "  " & baseName & OUTPUT_CSV_SUFFIX & vbCrLf & vbCrLf
    If glbOk Then
        msg = msg & "GLB exported:" & vbCrLf & "  " & baseName & ".glb" & vbCrLf & vbCrLf
        msg = msg & "In Spares Upload pack, add the GLB and either JSON or CSV."
    Else
        msg = msg & "GLB export needs one manual step:" & vbCrLf
        msg = msg & "  File → Save As → glTF Binary (*.glb)" & vbCrLf
        msg = msg & "  Save as " & baseName & ".glb in the same folder." & vbCrLf & vbCrLf
        msg = msg & "Then in Spares Upload pack, add that GLB plus the JSON or CSV."
    End If

    swApp.SendMsgToUser2 msg, swMbInformation, swMbOk
End Sub
