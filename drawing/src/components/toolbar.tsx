import * as React from "react"
import * as firebase from "firebase"
import { DrawingMode } from "./drawing-view"
import { EventEmitter, Events } from "../lib/events"

export const TOOLBAR_WIDTH = 48

export const BLACK = "#000"
export const RED = "#f00"
export const BLUE = "#00f"
export const GREEN = "#006400"

export interface ToolbarViewProps {
  mode: DrawingMode
  events: EventEmitter
}

export type ToolbarModalButton = "edit" | "drawBlackLine" | "drawRedLine" | "drawBlueLine" | "drawGreenLine" | "select"

export interface ToolbarViewState {
  selectedButton: ToolbarModalButton
}

export class ToolbarView extends React.Component<ToolbarViewProps, ToolbarViewState> {
  constructor(props:ToolbarViewProps){
    super(props)

    this.state = {
      selectedButton: "edit"
    }

    this.addEventListeners()
  }

  addEventListeners() {
    this.props.events.listen(Events.EditModeSelected, () => this.setState({selectedButton: "edit"}))
    this.props.events.listen(Events.LineDrawingToolSelected, (data) => {
      switch (data.color) {
        case BLACK:
          this.setState({selectedButton: "drawBlackLine"})
          break
        case RED:
          this.setState({selectedButton: "drawRedLine"})
          break
        case BLUE:
          this.setState({selectedButton: "drawBlueLine"})
          break
        case GREEN:
          this.setState({selectedButton: "drawGreenLine"})
          break
      }
    })
    this.props.events.listen(Events.SelectionToolSelected, () => this.setState({selectedButton: "select"}))
  }

  handleEditModeButton = () => this.props.events.emit(Events.EditModeSelected)
  handleLineDrawingToolButton = (color:string) => () => this.props.events.emit(Events.LineDrawingToolSelected, {color: color})
  handleSelectionToolButton = () => this.props.events.emit(Events.SelectionToolSelected)
  handleUndoButton = () => this.props.events.emit(Events.UndoPressed)
  handleRedoButton = () => this.props.events.emit(Events.RedoPressed)
  handleDeleteButton = () => this.props.events.emit(Events.DeletePressed)

  modalButtonClass(type:ToolbarModalButton) {
    return `button ${type === this.state.selectedButton ? "selected" : ""}`
  }

  render() {
    return (
      <div className="toolbar" style={{width: TOOLBAR_WIDTH}}>
        <div className="buttons">
          <div className={this.modalButtonClass("edit")} title="Edit Mode" onClick={this.handleEditModeButton}>A</div>
          <div className={this.modalButtonClass("drawBlackLine")} title="Black Line Drawing Mode" onClick={this.handleLineDrawingToolButton(BLACK)} style={{color: BLACK}}>🖉</div>
          <div className={this.modalButtonClass("drawRedLine")} title="Red Line Drawing Mode" onClick={this.handleLineDrawingToolButton(RED)} style={{color: RED}}>🖉</div>
          <div className={this.modalButtonClass("drawBlueLine")} title="Blue Line Drawing Mode" onClick={this.handleLineDrawingToolButton(BLUE)} style={{color: BLUE}}>🖉</div>
          <div className={this.modalButtonClass("drawGreenLine")} title="Green Line Drawing Mode" onClick={this.handleLineDrawingToolButton(GREEN)} style={{color: GREEN}}>🖉</div>
          <div className={this.modalButtonClass("select")} title="Select" onClick={this.handleSelectionToolButton}>⬚</div>
          <div className="button" title="Undo" onClick={this.handleUndoButton}>↶</div>
          <div className="button" title="Redo" onClick={this.handleRedoButton}>↷</div>
          <div className="button" title="Delete" onClick={this.handleDeleteButton}>🗑</div>
        </div>
      </div>
    )
  }
}