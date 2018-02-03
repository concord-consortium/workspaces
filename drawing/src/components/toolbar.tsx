import * as React from "react"
import * as firebase from "firebase"
import { DrawingMode } from "./drawing-view"
import { EventEmitter, Events } from "../lib/events"

export const TOOLBAR_WIDTH = 48

export interface ToolbarViewProps {
  mode: DrawingMode
  events: EventEmitter
}

export interface ToolbarViewState {
}

export class ToolbarView extends React.Component<ToolbarViewProps, ToolbarViewState> {
  constructor(props:ToolbarViewProps){
    super(props)

    this.state = {
    }
  }

  handleEditModeButton = () => this.props.events.emit(Events.EditModeSelected)
  handleDrawingModeButton = () => this.props.events.emit(Events.DrawingModeSelected)
  handleUndoButton = () => this.props.events.emit(Events.UndoPressed)
  handleRedoButton = () => this.props.events.emit(Events.RedoPressed)

  buttonClass(mode:DrawingMode) {
    return `button ${mode === this.props.mode ? "selected" : ""}`
  }

  render() {
    return (
      <div className="toolbar" style={{width: TOOLBAR_WIDTH}}>
        <div className="buttons">
          <div className={this.buttonClass("editing")} title="Edit Mode" onClick={this.handleEditModeButton}>A</div>
          <div className={this.buttonClass("drawing")} title="Drawing Mode" onClick={this.handleDrawingModeButton}>🖉</div>
          <div className="button" title="Undo" onClick={this.handleUndoButton}>↶</div>
          <div className="button" title="Redo" onClick={this.handleRedoButton}>↷</div>
        </div>
      </div>
    )
  }
}