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

export interface ToolbarFlyoutViewProps {
  selected: boolean
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

  handleChildClick = (e:React.MouseEvent<HTMLDivElement>, index:number) => {
    e.preventDefault()
    e.stopPropagation()
    this.setState({selectedIndex: index, open: false})
    const children = this.props.children as any
    const selected = children ? children[index] : null
    if (selected && selected.props.onClick) {
      selected.props.onClick()
    }
  }

  renderOpen() {
    const children = React.Children.map(this.props.children, (child, index) => {
      return <div className="flyout-menu-item" onClick={(e) => this.handleChildClick(e, index)}>{child}</div>
    })
    return (
      <div className="flyout-menu">{children}</div>
    )
  }

  render() {
    const {open, selectedIndex} = this.state
    const children = this.props.children as any
    const selected = children ? children[selectedIndex] : null
    if (!selected) {
      return null
    }
    const {props} = selected
    const className = this.props.selected ? "button selected" : "button"
    return (
      <div className="flyout-top-button">
        <div className={className} title={props.title} style={props.style} onClick={(e) => this.handleChildClick(e, selectedIndex)}>{props.children}</div>
        {open ? this.renderOpen() : null}
        <div className="flyout-toggle" onClick={this.handleToggleOpen}>{open ? "▼" : "▶"}</div>
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
      return <div key={index} className="button" title={`${lineColor.name} Line Drawing Mode`} onClick={this.handleLineDrawingToolButton(lineColor)} style={{color: lineColor.hex}}>🖉</div>
    })
  }

  renderImageSetItems() {
    return this.props.imageSetItems.map((imageSetItem, index) => {
      return <div key={index} className="button" title={imageSetItem.title} onClick={() => this.handleImageToolButton({imageSetItem})}><img src={imageSetItem.src} /></div>
    })
  }

  render() {
    return (
      <div className="toolbar" style={{width: TOOLBAR_WIDTH}}>
        <div className="buttons">
          <div className={this.modalButtonClass("edit")} title="Edit Mode" onClick={this.handleEditModeButton}>A</div>
          <ToolbarFlyoutView selected={"line" === this.state.selectedButton}>
            {this.renderLineButtons()}
          </ToolbarFlyoutView>
          <ToolbarFlyoutView selected={"image" === this.state.selectedButton}>
            {this.renderImageSetItems()}
          </ToolbarFlyoutView>
          <div className={this.modalButtonClass("select")} title="Select" onClick={this.handleSelectionToolButton}>⬚</div>
          <div className="button" title="Undo" onClick={this.handleUndoButton}>↶</div>
          <div className="button" title="Redo" onClick={this.handleRedoButton}>↷</div>
          <div className="button" title="Delete" onClick={this.handleDeleteButton}>🗑</div>
        </div>
      </div>
    )
  }
}