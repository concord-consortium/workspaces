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
  toolbarElement: HTMLDivElement

  constructor(props:DrawingViewProps){
    super(props)

    this.state = {
      mode: "editing"
    }

    this.events = new EventEmitter()
    this.addEventListeners()
  }

  componentDidMount() {
    this.toolbarElement = document.getElementsByClassName("firepad-toolbar")[0] as HTMLDivElement
  }

  setEditingMode(editing:boolean) {
    if (this.toolbarElement) {
      this.toolbarElement.style.opacity = editing ? "1" : "0.5"
    }
    this.setState({mode: editing ? "editing" : "drawing"})
  }

  addEventListeners() {
    this.events.listen(Events.EditModeSelected, () => this.setEditingMode(true))
    this.events.listen(Events.LineDrawingToolSelected, () => this.setEditingMode(false))
    this.events.listen(Events.SelectionToolSelected, () => this.setEditingMode(false))
    this.events.listen(Events.CoinToolSelected, () => this.setEditingMode(false))
    this.events.listen(Events.PouchToolSelected, () => this.setEditingMode(false))
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