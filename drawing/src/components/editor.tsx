import * as React from "react"
import * as firebase from "firebase"
import * as CodeMirror from "codemirror"
import { EventEmitter, Events } from "../lib/events"

// Firepad tries to require the node version of firebase if it isn't defined on the window and expects CodeMirror defined on window
const win = window as any
win.CodeMirror = CodeMirror
win.firebase = firebase
const Firepad = require("firepad/dist/firepad.js")

import "codemirror/lib/codemirror.css"
import "firepad/dist/firepad.css"

export interface EditorViewProps {
  firebaseRef: firebase.database.Reference
  enabled: boolean
  events: EventEmitter
}

export interface EditorViewState {
}

export class EditorView extends React.Component<EditorViewProps, EditorViewState> {
  editorRef: firebase.database.Reference
  firepad: any
  codeMirror: CodeMirror.EditorFromTextArea

  constructor(props:EditorViewProps){
    super(props)

    this.state = {}

    this.editorRef = this.props.firebaseRef.child("editor")
  }

  refs: {
    editor: HTMLTextAreaElement
  }

  componentDidMount() {
    this.codeMirror = CodeMirror.fromTextArea(this.refs.editor)
    this.firepad = Firepad.fromCodeMirror(this.editorRef, this.codeMirror, { richTextToolbar: true, richTextShortcuts: true });

    if (this.props.enabled) {
      this.codeMirror.focus()
    }

    this.props.events.listen(Events.UndoPressed, this.ifEnabled(() => this.firepad.undo()))
    this.props.events.listen(Events.RedoPressed, this.ifEnabled(() => this.firepad.redo()))
  }

  componentWillReceiveProps(nextProps:EditorViewProps) {
    if (nextProps.enabled && !this.props.enabled) {
      this.codeMirror.focus()
    }
  }

  ifEnabled(callback:Function) {
    return () => {
      if (this.props.enabled) {
        callback()
      }
    }
  }

  shouldComponentUpdate() {
    return false
  }

  render() {
    return <textarea ref="editor" className="editor" />
  }
}