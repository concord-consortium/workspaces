import * as React from "react"
import * as firebase from "firebase"
import * as CodeMirror from "codemirror"

// Firepad tries to require the node version of firebase if it isn't defined on the window and expects CodeMirror defined on window
const win = window as any
win.CodeMirror = CodeMirror
win.firebase = firebase
const Firepad = require("firepad/dist/firepad.js")

import "codemirror/lib/codemirror.css"
import "firepad/dist/firepad.css"

export interface EditorViewProps {
  firebaseRef: firebase.database.Reference
}

export interface EditorViewState {
}

export class EditorView extends React.Component<EditorViewProps, EditorViewState> {
  editorRef: firebase.database.Reference

  constructor(props:EditorViewProps){
    super(props)

    this.state = {}

    this.editorRef = this.props.firebaseRef.child("editor")
  }

  refs: {
    editor: HTMLTextAreaElement
  }

  componentDidMount() {
    const codeMirror = CodeMirror.fromTextArea(this.refs.editor)
    const firepad = Firepad.fromCodeMirror(this.editorRef, codeMirror, { richTextToolbar: false, richTextShortcuts: true });
  }

  shouldComponentUpdate() {
    return false
  }

  render() {
    return <textarea ref="editor" className="editor" />
  }
}