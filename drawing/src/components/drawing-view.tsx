import * as React from "react"
import * as firebase from "firebase"
import { EditorView } from "./editor"
import { DrawingLayerView } from "./drawing-layer"
import { ToolbarView } from "./toolbar"
import { EventEmitter, Events } from "../lib/events"
import { TOOLBAR_WIDTH } from "./toolbar"

export type DrawingMode = "drawing" | "editing"

export interface DrawingViewProps {
  firebaseRef: firebase.database.Reference
}

export interface DrawingViewState {
  mode: DrawingMode
}

export class DrawingView extends React.Component<DrawingViewProps, DrawingViewState> {
  events: EventEmitter

  constructor(props:DrawingViewProps){
    super(props)

    this.state = {
      mode: "editing"
    }

    this.events = new EventEmitter()
    this.addEventListeners()
  }

  addEventListeners() {
    this.events.listen(Events.EditModeSelected, () => this.setState({mode: "editing"}))
    this.events.listen(Events.DrawingModeSelected, () => this.setState({mode: "drawing"}))
  }

  render() {
    return (
      <div>
        <ToolbarView mode={this.state.mode} events={this.events} />
        <div className="workspace" style={{left: TOOLBAR_WIDTH}}>
          <EditorView firebaseRef={this.props.firebaseRef} events={this.events} enabled={this.state.mode === "editing"} />
          <DrawingLayerView firebaseRef={this.props.firebaseRef} events={this.events} enabled={this.state.mode === "drawing"} />
        </div>
      </div>
    )
  }
}