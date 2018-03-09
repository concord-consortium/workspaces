import * as React from "react"
import * as firebase from "firebase"
import { DrawingMode } from "./drawing-view"
import { ImageSetItem } from "./drawing-layer"
import { EventEmitter, Events } from "../lib/events"

export const TOOLBAR_WIDTH = 48

export interface Color {
  name: string
  hex: string
}
export const colors:Color[] = [
  {name: "Black", hex: "#000"},
  {name: "Red", hex: "#f00"},
  {name: "Green", hex: "#006400"},
  {name: "Blue", hex: "#00f"},
]

export interface TextButtonData {
  color: string
}

export interface PolygonButtonData {
  type: string
  stroke?: string
  fill?: string
}

export interface ImageButtonData {
  imageSetItem: ImageSetItem
}

export interface LineButtonData {
  lineColor: Color
}

export type ToolbarModalButton = "text" | "line" | "rectangle" | "ellipse" | "image" | "select" | "settings"

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
  events: EventEmitter
  imageSetItems: ImageSetItem[]
}

export interface ToolbarViewState {
  selectedButton: ToolbarModalButton|null
  stroke: string,
  fill: string,
  strokeDashArray: string,
  strokeWidth: number,
  fontSize: number
}

export class ToolbarView extends React.Component<ToolbarViewProps, ToolbarViewState> {
  constructor(props:ToolbarViewProps){
    super(props)

    this.state = {
      selectedButton: "select",
      stroke: "#000",
      fill: "none",
      strokeDashArray: "",
      strokeWidth: 3,
      fontSize: 27
    }

    this.addEventListeners()
  }

  addEventListeners() {
    this.props.events.listen(Events.TextToolSelected, () => this.setState({selectedButton: "text"}))
    this.props.events.listen(Events.LineDrawingToolSelected, (data:LineButtonData) => this.setState({selectedButton: "line"}))
    this.props.events.listen(Events.ImageToolSelected, (data:ImageButtonData) => this.setState({selectedButton: "image"}))
    this.props.events.listen(Events.SelectionToolSelected, () => this.setState({selectedButton: "select"}))
    this.props.events.listen(Events.RectangleToolSelected, () => this.setState({selectedButton: "rectangle"}))
    this.props.events.listen(Events.EllipseToolSelected, () => this.setState({selectedButton: "ellipse"}))
    this.props.events.listen(Events.SettingsToolSelected, () => this.setState({selectedButton: this.state.selectedButton === "settings" ? "select" : "settings"}))
  }

  handleSettingsButton = () => this.props.events.emit(Events.SettingsToolSelected)
  handleTextToolButton = (color:string) => () => this.props.events.emit(Events.TextToolSelected, {color})
  handleLineDrawingToolButton = (lineColor:Color) => () => this.props.events.emit(Events.LineDrawingToolSelected, {lineColor})
  handleSelectionToolButton = () => this.props.events.emit(Events.SelectionToolSelected)
  handleImageToolButton = (data:ImageButtonData) => () => this.props.events.emit(Events.ImageToolSelected, {imageSetItem: data.imageSetItem})
  handleRectangleToolButton = (data:PolygonButtonData) => () => this.props.events.emit(Events.RectangleToolSelected, {fill: data.fill, stroke: data.stroke})
  handleEllipsisToolButton = (data:PolygonButtonData) => () => this.props.events.emit(Events.EllipseToolSelected, {fill: data.fill, stroke: data.stroke})
  handleUndoButton = () => this.props.events.emit(Events.UndoPressed)
  handleRedoButton = () => this.props.events.emit(Events.RedoPressed)
  handleDeleteButton = () => this.props.events.emit(Events.DeletePressed)

  handleStrokeChange = (e:React.ChangeEvent<HTMLSelectElement>) => this.setState({stroke: e.target.value})
  handleFillChange = (e:React.ChangeEvent<HTMLSelectElement>) => this.setState({fill: e.target.value})
  handleStrokeDashArrayChange = (e:React.ChangeEvent<HTMLSelectElement>) => this.setState({strokeDashArray: e.target.value})
  handleStrokeWidthChange = (e:React.ChangeEvent<HTMLSelectElement>) => this.setState({strokeWidth: parseInt(e.target.value, 10)})
  handleFontSizeChange = (e:React.ChangeEvent<HTMLSelectElement>) => this.setState({fontSize: parseInt(e.target.value, 10)})

  modalButtonClass(type:ToolbarModalButton) {
    const selected = type === this.state.selectedButton
    return `button ${selected ? "selected" : ""}`
  }

  renderTextButtons() {
    return colors.map((lineColor, index) => {
      return <div key={index} className="button" title={`${lineColor.name} Text Drawing Mode`} onClick={this.handleTextToolButton(lineColor.hex)} style={{color: lineColor.hex}}>A</div>
    })
  }

  renderLineButtons() {
    return colors.map((lineColor, index) => {
      return <div key={index} className="button" title={`${lineColor.name} Line Drawing Mode`} onClick={this.handleLineDrawingToolButton(lineColor)} style={{color: lineColor.hex}}><span className="icon icon-pencil" /></div>
    })
  }

  renderImageSetItems() {
    return this.props.imageSetItems.map((imageSetItem, index) => {
      return <div key={index} className="button" title={imageSetItem.title} onClick={this.handleImageToolButton({imageSetItem})}><img src={imageSetItem.src} /></div>
    })
  }

  renderPolygons(name: string, outline:string, solid:string, handler:(data:PolygonButtonData) => any) {
    const polygons:JSX.Element[] = []
    colors.forEach((lineColor, index) => {
      polygons.push(<div key={`outline-${index}`} className="button" title={`${lineColor.name} Outline ${name} Drawing Mode`} onClick={handler({type: name.toLowerCase(), stroke: lineColor.hex, fill: "none"})} style={{color: lineColor.hex}}>{outline}</div>)
    })
    colors.forEach((lineColor, index) => {
      polygons.push(<div key={`solid-${index}`} className="button" title={`${lineColor.name} Solid ${name} Drawing Mode`} onClick={handler({type: name.toLowerCase(), stroke: lineColor.hex, fill: lineColor.hex})} style={{color: lineColor.hex}}>{solid}</div>)
    })
    return polygons
  }

  renderSettings() {
    const pluralize = (text: string, count: number) => count === 1 ? text : `${text}s`
    return (
      <div className="settings" style={{left: TOOLBAR_WIDTH}}>
        <div className="title">Settings</div>
        <form>
          <div className="form-group">
            <label htmlFor="stroke">Color</label>
            <select value={this.state.stroke} name="stroke" onChange={this.handleStrokeChange}>
              {colors.map((color, index) => <option value={color.hex} key={index}>{color.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="fill">Fill</label>
            <select value={this.state.fill} name="fill" onChange={this.handleFillChange}>
              <option value="none" key="none">None</option>
              {colors.map((color, index) => <option value={color.hex} key={index}>{color.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="strokeDashArray">Stroke</label>
            <select value={this.state.strokeDashArray} name="strokeDashArray" onChange={this.handleStrokeDashArrayChange}>
              <option value="">Solid</option>
              <option value="5,5">Dotted</option>
              <option value="10,10">Dashed</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="strokeWidth">Thickness</label>
            <select value={this.state.strokeWidth} name="strokeWidth" onChange={this.handleStrokeWidthChange}>
              {[1, 2, 3, 4, 5].map((strokeWidth) => <option value={strokeWidth} key={strokeWidth}>{strokeWidth} {pluralize("pixel", strokeWidth)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="fontSize">Font Size</label>
            <select value={this.state.fontSize} name="fontSize" onChange={this.handleFontSizeChange}>
              {[12, 17, 22, 27, 32, 37, 42].map((fontSize) => <option value={fontSize} key={fontSize}>{fontSize} {pluralize("pixel", fontSize)}</option>)}
            </select>
          </div>
        </form>
      </div>
    )
  }

  render() {
    return (
      <div className="toolbar" style={{width: TOOLBAR_WIDTH}}>
        <div className="buttons">
          <div className={this.modalButtonClass("select")} title="Select" onClick={this.handleSelectionToolButton}><span className="icon icon-mouse-pointer" /></div>
          <div className={this.modalButtonClass("settings")} title="Settings" onClick={this.handleSettingsButton}>S</div>
          <ToolbarFlyoutView selected={"line" === this.state.selectedButton}>
            {this.renderLineButtons()}
          </ToolbarFlyoutView>
          <ToolbarFlyoutView selected={"rectangle" === this.state.selectedButton}>
            {this.renderPolygons("Rectangle", "◻", "◼", this.handleRectangleToolButton)}
          </ToolbarFlyoutView>
          <ToolbarFlyoutView selected={"ellipse" === this.state.selectedButton}>
            {this.renderPolygons("Ellipsis", "⬭", "⬬", this.handleEllipsisToolButton)}
          </ToolbarFlyoutView>
          <ToolbarFlyoutView selected={"image" === this.state.selectedButton}>
            {this.renderImageSetItems()}
          </ToolbarFlyoutView>
          <ToolbarFlyoutView selected={"text" === this.state.selectedButton}>
            {this.renderTextButtons()}
          </ToolbarFlyoutView>
          <div className="button" title="Undo" onClick={this.handleUndoButton}><span className="icon icon-undo" /></div>
          <div className="button" title="Redo" onClick={this.handleRedoButton}><span className="icon icon-redo" /></div>
          <div className="button" title="Delete" onClick={this.handleDeleteButton}><span className="icon icon-bin" /></div>
        </div>
        {this.state.selectedButton === "settings" ? this.renderSettings() : null}
      </div>
    )
  }
}