import * as React from "react"
import * as firebase from "firebase"
import { DrawingMode } from "./drawing-view"
import { ImageSetItem } from "./drawing-layer"
import { EventEmitter, Events } from "../lib/events"

export const TOOLBAR_WIDTH = 48

export interface LineColor {
  name: string
  hex: string
}
export const lineColors:LineColor[] = [
  {name: "Black", hex: "#000"},
  {name: "Red", hex: "#f00"},
  {name: "Green", hex: "#006400"},
  {name: "Blue", hex: "#00f"},
]

export interface ImageButtonData {
  imageSetItem: ImageSetItem
}

export interface LineButtonData {
  lineColor: LineColor
}

export type ToolbarModalButton = "edit" | "line" | "image" | "select"

export interface ToolbarFlyoutMenuViewProps {
}

export interface ToolbarFlyoutMenuViewState {
}

export class ToolbarFlyoutMenuView extends React.Component<ToolbarFlyoutMenuViewProps, ToolbarFlyoutMenuViewState> {
  constructor(props:ToolbarFlyoutMenuViewProps){
    super(props)

    this.state = {
      open: false
    }
  }
}

export interface ToolbarFlyoutViewProps {
}

export interface ToolbarFlyoutViewState {
  open: boolean,
  selectedIndex: number
}

export interface FlyoutMenuItem {
  title: string
  icon: string
}

export class ToolbarFlyoutView extends React.Component<ToolbarFlyoutViewProps, ToolbarFlyoutViewState> {
  constructor(props:ToolbarFlyoutViewProps){
    super(props)

    this.state = {
      open: false,
      selectedIndex: 0
    }
  }

  handleToggleOpen = () => {
    this.setState({open: !this.state.open})
  }

  renderOpen() {
    return (
      <div className="flyout-menu">{this.props.children}</div>
    )
  }

  render() {
    const children = this.props.children as any
    const selected = children ? children[this.state.selectedIndex] : null
    if (!selected) {
      return null
    }
    return (
      <div>
        <div className="button" title={selected.props.title} onClick={this.handleToggleOpen}>{selected.props.children}</div>
        {this.state.open ? this.renderOpen() : null}
      </div>
    )
  }
}

export interface ToolbarViewProps {
  mode: DrawingMode
  events: EventEmitter
  imageSetItems: ImageSetItem[]
}

export interface ToolbarViewState {
  selectedButton: ToolbarModalButton
  selectedImageSetItem: ImageSetItem|null
  selectedLineColor: LineColor
  testScreenCaptureUrl: string|null
}

export class ToolbarView extends React.Component<ToolbarViewProps, ToolbarViewState> {
  constructor(props:ToolbarViewProps){
    super(props)

    this.state = {
      selectedButton: "edit",
      selectedImageSetItem: null,
      selectedLineColor: lineColors[0],
      testScreenCaptureUrl: null
    }

    this.addEventListeners()
  }

  addEventListeners() {
    this.props.events.listen(Events.EditModeSelected, () => this.setState({selectedButton: "edit"}))
    this.props.events.listen(Events.LineDrawingToolSelected, (data:LineButtonData) => this.setState({selectedButton: "line", selectedLineColor: data.lineColor}))
    this.props.events.listen(Events.ImageToolSelected, (data:ImageButtonData) => this.setState({selectedButton: "image", selectedImageSetItem: data.imageSetItem}))
    this.props.events.listen(Events.SelectionToolSelected, () => this.setState({selectedButton: "select"}))
  }

  handleEditModeButton = () => this.props.events.emit(Events.EditModeSelected)
  handleLineDrawingToolButton = (lineColor:LineColor) => () => this.props.events.emit(Events.LineDrawingToolSelected, {lineColor})
  handleSelectionToolButton = () => this.props.events.emit(Events.SelectionToolSelected)
  handleImageToolButton = (data:ImageButtonData) => this.props.events.emit(Events.ImageToolSelected, {imageSetItem: data.imageSetItem})
  handleUndoButton = () => this.props.events.emit(Events.UndoPressed)
  handleRedoButton = () => this.props.events.emit(Events.RedoPressed)
  handleDeleteButton = () => this.props.events.emit(Events.DeletePressed)

  lineButtonClass(color:LineColor) {
    const selected = "line" === this.state.selectedButton && (color === this.state.selectedLineColor)
    return `button ${selected ? "selected" : ""}`
  }

  modalButtonClass(type:ToolbarModalButton, imageSetItem?:ImageSetItem) {
    const selected = type === this.state.selectedButton && ((type !== "image") || (imageSetItem === this.state.selectedImageSetItem))
    return `button ${selected ? "selected" : ""}`
  }

  renderLineButtons() {
    return lineColors.map((lineColor, index) => {
      const selected = ("line" === this.state.selectedButton) && (lineColor === this.state.selectedLineColor)
      const className = `button ${selected ? "selected" : ""}`
      return <div key={index} className={className} title={`${lineColor.name} Line Drawing Mode`} onClick={this.handleLineDrawingToolButton(lineColor)} style={{color: lineColor.hex}}>🖉</div>
    })
  }

  renderImageSetItems() {
    return this.props.imageSetItems.map((imageSetItem, index) => {
      return <div key={index} className={this.modalButtonClass("image", imageSetItem)} title={imageSetItem.title} onClick={() => this.handleImageToolButton({imageSetItem})}><img src={imageSetItem.src} /></div>
    })
  }

  render() {
    /*
              <ToolbarFlyoutView>
            <div className="button" title="first">1</div>
            <div className="button" title="second">2</div>
            <div className="button" title="third">3</div>
          </ToolbarFlyoutView>
    */
    return (
      <div className="toolbar" style={{width: TOOLBAR_WIDTH}}>
        <div className="buttons">
          <div className={this.modalButtonClass("edit")} title="Edit Mode" onClick={this.handleEditModeButton}>A</div>
          {this.renderLineButtons()}
          {this.renderImageSetItems()}
          <div className={this.modalButtonClass("select")} title="Select" onClick={this.handleSelectionToolButton}>⬚</div>
          <div className="button" title="Undo" onClick={this.handleUndoButton}>↶</div>
          <div className="button" title="Redo" onClick={this.handleRedoButton}>↷</div>
          <div className="button" title="Delete" onClick={this.handleDeleteButton}>🗑</div>
        </div>
      </div>
    )
  }
}