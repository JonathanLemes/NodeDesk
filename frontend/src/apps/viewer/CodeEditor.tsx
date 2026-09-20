import { defaultKeymap, indentWithTab } from "@codemirror/commands"
import { css } from "@codemirror/lang-css"
import { html } from "@codemirror/lang-html"
import { javascript } from "@codemirror/lang-javascript"
import { json } from "@codemirror/lang-json"
import { markdown } from "@codemirror/lang-markdown"
import { python } from "@codemirror/lang-python"
import { sql } from "@codemirror/lang-sql"
import { xml } from "@codemirror/lang-xml"
import { yaml } from "@codemirror/lang-yaml"
import { HighlightStyle, StreamLanguage, syntaxHighlighting, type LanguageSupport } from "@codemirror/language"
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile"
import { nginx } from "@codemirror/legacy-modes/mode/nginx"
import { properties } from "@codemirror/legacy-modes/mode/properties"
import { shell } from "@codemirror/legacy-modes/mode/shell"
import { toml } from "@codemirror/legacy-modes/mode/toml"
import { Compartment, EditorState, type Extension } from "@codemirror/state"
import { EditorView, keymap } from "@codemirror/view"
import { tags as t } from "@lezer/highlight"
import { basicSetup } from "codemirror"
import { useEffect, useRef } from "react"

const lightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: "#a626a4" },
  { tag: [t.string, t.special(t.string)], color: "#50a14f" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "#b76b01" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#8a8f98", fontStyle: "italic" },
  { tag: [t.propertyName, t.attributeName], color: "#4078f2" },
  { tag: [t.function(t.variableName), t.className, t.typeName], color: "#c18401" },
  { tag: [t.heading], color: "#e45649", fontWeight: "600" },
  { tag: [t.link, t.url], color: "#4078f2", textDecoration: "underline" },
  { tag: [t.emphasis], fontStyle: "italic" },
  { tag: [t.strong], fontWeight: "600" },
])
const darkStyle = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: "#c678dd" },
  { tag: [t.string, t.special(t.string)], color: "#98c379" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "#d19a66" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#7f848e", fontStyle: "italic" },
  { tag: [t.propertyName, t.attributeName], color: "#61afef" },
  { tag: [t.function(t.variableName), t.className, t.typeName], color: "#e5c07b" },
  { tag: [t.heading], color: "#e06c75", fontWeight: "600" },
  { tag: [t.link, t.url], color: "#61afef", textDecoration: "underline" },
  { tag: [t.emphasis], fontStyle: "italic" },
  { tag: [t.strong], fontWeight: "600" },
])

function language(name: string): LanguageSupport | StreamLanguage<unknown> | null {
  const lower = name.toLowerCase()
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : lower
  switch (ext) {
    case "json": case "jsonc": return json()
    case "yml": case "yaml": return yaml()
    case "md": case "markdown": return markdown()
    case "js": case "mjs": case "cjs": case "jsx": return javascript({ jsx: true })
    case "ts": case "tsx": return javascript({ jsx: true, typescript: true })
    case "py": return python()
    case "html": case "htm": return html()
    case "css": return css()
    case "xml": case "svg": return xml()
    case "sql": return sql()
    case "sh": case "bash": case "zsh": case "env": return StreamLanguage.define(shell)
    case "toml": return StreamLanguage.define(toml)
    case "conf": case "ini": case "cfg": case "properties": case "service": case "timer": return StreamLanguage.define(properties)
    case "nginx": return StreamLanguage.define(nginx)
    case "dockerfile": return StreamLanguage.define(dockerFile)
  }
  if (lower === "dockerfile") return StreamLanguage.define(dockerFile)
  if (lower.startsWith("compose")) return yaml()
  return null
}

const chrome = (dark: boolean): Extension =>
  EditorView.theme({
    "&": { height: "100%", backgroundColor: "transparent", color: "var(--foreground)", fontSize: "13px" },
    ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6" },
    ".cm-content": { padding: "12px 0", caretColor: "var(--primary)" },
    ".cm-gutters": { backgroundColor: "transparent", color: "var(--muted-foreground)", border: "none", opacity: "0.7" },
    ".cm-activeLine": { backgroundColor: "color-mix(in oklch, var(--foreground) 5%, transparent)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "color-mix(in oklch, var(--primary) 28%, transparent) !important" },
    "&.cm-focused": { outline: "none" },
    ".cm-panels": { backgroundColor: "var(--popover)", color: "var(--foreground)", borderColor: "var(--border)" },
    ".cm-searchMatch": { backgroundColor: "color-mix(in oklch, var(--warn) 40%, transparent)" },
  }, { dark })

interface CodeEditorProps {
  value: string
  fileName: string
  readOnly: boolean
  dark: boolean
  onChange: (value: string) => void
}

export default function CodeEditor({ value, fileName, readOnly, dark, onChange }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const theme = useRef(new Compartment())
  const ro = useRef(new Compartment())
  const cb = useRef({ onChange })
  cb.current = { onChange }

  useEffect(() => {
    const lang = language(fileName)
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab, ...defaultKeymap]), // saving is a service shortcut (viewer.save)
          lang ?? [],
          theme.current.of([chrome(dark), syntaxHighlighting(dark ? darkStyle : lightStyle)]),
          ro.current.of(EditorState.readOnly.of(readOnly)),
          EditorView.updateListener.of((u) => u.docChanged && cb.current.onChange(u.state.doc.toString())),
        ],
      }),
    })
    view.current = v
    return () => v.destroy()
    // The editor is created once per file; value changes come from typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileName])

  // Replace content when the file is reloaded from disk.
  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
  }, [value])

  useEffect(() => {
    view.current?.dispatch({ effects: theme.current.reconfigure([chrome(dark), syntaxHighlighting(dark ? darkStyle : lightStyle)]) })
  }, [dark])
  useEffect(() => {
    view.current?.dispatch({ effects: ro.current.reconfigure(EditorState.readOnly.of(readOnly)) })
  }, [readOnly])

  return <div ref={host} className="h-full overflow-hidden" />
}
