import * as React from "react"
import * as firebase from "firebase"
import { EditorView } from "./editor-view"

export interface DrawingViewProps {
  firebaseRef: firebase.database.Reference
}

export interface DrawingViewState {
}

export class DrawingView extends React.Component<DrawingViewProps, DrawingViewState> {
  constructor(props:DrawingViewProps){
    super(props)

    this.state = {}
  }

  render() {
    return <EditorView firebaseRef={this.props.firebaseRef} />
  }
}