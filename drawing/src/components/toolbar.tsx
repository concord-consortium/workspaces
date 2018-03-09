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
  {name: "Aqua",    hex: "#00FFFF"},
  {name: "Black",   hex: "#000000"},
  {name: "Blue",    hex: "#0000FF"},
  {name: "Fuchsia", hex: "#FF00FF"},
  {name: "Gray",    hex: "#808080"},
  {name: "Green",   hex: "#008000"},
  {name: "Lime",    hex: "#00FF00"},
  {name: "Maroon",  hex: "#800000"},
  {name: "Navy",    hex: "#000080"},
  {name: "Olive",   hex: "#808000"},
  {name: "Purple",  hex: "#800080"},
  {name: "Red",     hex: "#FF0000"},
  {name: "Silver",  hex: "#C0C0C0"},
  {name: "Teal",    hex: "#008080"},
  {name: "Yellow",  hex: "#FFFF00"}
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

export type ToolbarModalButton = "text" | "line" | "rectangle" | "ellipse" | "image" | "select" | "vector"

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

export interface ToolbarSettings {
  stroke: string,
  fill: string,
  strokeDashArray: string,
  strokeWidth: number,
  fontSize: number,
  fontStyle: "normal" | "italic",
  fontWeight: "normal" | "bold"
}

export const DefaultToolbarSettings:ToolbarSettings = {
  stroke: "#000000",
  fill: "none",
  strokeDashArray: "",
  strokeWidth: 2,
  fontSize: 27,
  fontStyle: "normal",
  fontWeight: "normal"
}

export interface ToolbarViewProps {
  events: EventEmitter
  imageSetItems: ImageSetItem[]
}

export interface ToolbarViewState extends ToolbarSettings {
  selectedButton: ToolbarModalButton|null
  showSettings: boolean
}

export class ToolbarView extends React.Component<ToolbarViewProps, ToolbarViewState> {
  constructor(props:ToolbarViewProps){
    super(props)

    const {stroke, fill, strokeDashArray, strokeWidth, fontSize, fontStyle, fontWeight} = DefaultToolbarSettings
    this.state = {
      selectedButton: "select",
      showSettings: false,
      stroke,
      fill,
      strokeDashArray,
      strokeWidth,
      fontSize,
      fontStyle,
      fontWeight
    }

    this.addEventListeners()
  }

  addEventListeners() {
    this.props.events.listen(Events.TextToolSelected, () => this.setState({selectedButton: "text"}))
    this.props.events.listen(Events.LineDrawingToolSelected, () => this.setState({selectedButton: "line"}))
    this.props.events.listen(Events.VectorToolSelected, () => this.setState({selectedButton: "vector"}))
    this.props.events.listen(Events.ImageToolSelected, () => this.setState({selectedButton: "image"}))
    this.props.events.listen(Events.SelectionToolSelected, () => this.setState({selectedButton: "select"}))
    this.props.events.listen(Events.RectangleToolSelected, () => this.setState({selectedButton: "rectangle"}))
    this.props.events.listen(Events.EllipseToolSelected, () => this.setState({selectedButton: "ellipse"}))
    this.props.events.listen(Events.SettingsToolSelected, () => this.setState({showSettings: !this.state.showSettings}))
  }

  settings() {
    const {stroke, fill, strokeDashArray, strokeWidth, fontSize, fontStyle, fontWeight} = this.state
    const settings:ToolbarSettings = {
      stroke,
      fill,
      strokeDashArray: this.computeStrokeDashArray(strokeDashArray, strokeWidth),
      strokeWidth,
      fontSize,
      fontStyle,
      fontWeight
    }
    return settings
  }

  handleSettingsButton = () => this.props.events.emit(Events.SettingsToolSelected)
  handleTextToolButton = () => this.props.events.emit(Events.TextToolSelected, this.settings())
  handleLineDrawingToolButton = () => this.props.events.emit(Events.LineDrawingToolSelected, this.settings())
  handleVectorToolButton = () => this.props.events.emit(Events.VectorToolSelected, this.settings())
  handleSelectionToolButton = () => this.props.events.emit(Events.SelectionToolSelected)
  handleImageToolButton = (data:ImageButtonData) => () => this.props.events.emit(Events.ImageToolSelected, {imageSetItem: data.imageSetItem})
  handleRectangleToolButton = () => this.props.events.emit(Events.RectangleToolSelected, this.settings())
  handleEllipsisToolButton = () => this.props.events.emit(Events.EllipseToolSelected, this.settings())
  handleUndoButton = () => this.props.events.emit(Events.UndoPressed)
  handleRedoButton = () => this.props.events.emit(Events.RedoPressed)
  handleDeleteButton = () => this.props.events.emit(Events.DeletePressed)

  handleStrokeChange = (e:React.ChangeEvent<HTMLSelectElement>) => this.settingsChange({stroke: e.target.value})
  handleFillChange = (e:React.ChangeEvent<HTMLSelectElement>) => this.settingsChange({fill: e.target.value})
  handleStrokeDashArrayChange = (e:React.ChangeEvent<HTMLSelectElement>) => this.settingsChange({strokeDashArray: e.target.value})
  handleStrokeWidthChange = (e:React.ChangeEvent<HTMLSelectElement>) => this.settingsChange({strokeWidth: parseInt(e.target.value, 10)})
  handleFontSizeChange = (e:React.ChangeEvent<HTMLSelectElement>) => this.settingsChange({fontSize: parseInt(e.target.value, 10)})
  handleFontWeightChange = (e:React.ChangeEvent<HTMLSelectElement>) => this.settingsChange({fontWeight: e.target.value as any})
  handleFontStyleChange = (e:React.ChangeEvent<HTMLSelectElement>) => this.settingsChange({fontStyle: e.target.value as any})

  computeStrokeDashArray(type: string, strokeWidth: number) {
    switch (type) {
      case "dotted":
        return `${strokeWidth},${strokeWidth}`
      case "dashed":
        return `${strokeWidth*3},${strokeWidth*3}`
      default:
        return ""
    }
  }

  settingsChange(newState: Partial<ToolbarViewState>) {
    this.setState(newState as any, () => {
      this.props.events.emit(Events.SettingsChanged, this.settings())
    })
  }

  modalButtonClass(type:ToolbarModalButton) {
    const selected = type === this.state.selectedButton
    return `button ${selected ? "selected" : ""}`
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
        <div className="title"><span className="icon icon-cog" /> Settings</div>
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
              <option value="dotted">Dotted</option>
              <option value="dashed">Dashed</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="strokeWidth">Thickness</label>
            <select value={this.state.strokeWidth} name="strokeWidth" onChange={this.handleStrokeWidthChange}>
              {[1, 2, 3, 4, 5].map((strokeWidth) => <option value={strokeWidth} key={strokeWidth}>{strokeWidth} {pluralize("pixel", strokeWidth)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="fontSize">Text Size</label>
            <select value={this.state.fontSize} name="fontSize" onChange={this.handleFontSizeChange}>
              {[12, 17, 22, 27, 32, 37, 42].map((fontSize) => <option value={fontSize} key={fontSize}>{fontSize} {pluralize("pixel", fontSize)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="fontWeight">Text Weight</label>
            <select value={this.state.fontWeight} name="fontWeight" onChange={this.handleFontWeightChange}>
              {["normal", "bold"].map((fontWeight) => <option value={fontWeight} key={fontWeight}>{fontWeight}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="fontStyle">Text Style</label>
            <select value={this.state.fontStyle} name="fontStyle" onChange={this.handleFontStyleChange}>
              {["normal", "italic"].map((fontStyle) => <option value={fontStyle} key={fontStyle}>{fontStyle}</option>)}
            </select>
          </div>
        </form>
      </div>
    )
  }

  renderSVGIcon(button: ToolbarModalButton) {
    const {stroke, fill, strokeDashArray, strokeWidth} = this.state
    let iconElement: JSX.Element|null = null
    const iconSize = 30
    const iconMargin = 5
    const elementSize = iconSize - (2 * iconMargin)
    const elementHalfSize = elementSize / 2

    switch (button) {
      case "rectangle":
        iconElement = <rect width={elementSize} height={elementSize} />
        break
      case "ellipse":
        iconElement = <ellipse cx={elementHalfSize} cy={elementHalfSize} rx={elementHalfSize} ry={elementHalfSize}  />
        break
      case "vector":
        iconElement = <line x1={0} y1={elementHalfSize} x2={elementSize} y2={elementHalfSize}  />
        break
    }

    return (
      <svg width={iconSize} height={iconSize}>
        <g transform={`translate(${iconMargin},${iconMargin})`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={this.computeStrokeDashArray(strokeDashArray, strokeWidth)}>
          {iconElement}
        </g>
      </svg>
    )
  }

  render() {
    const {stroke, fontSize, fontStyle, fontWeight} = this.state
    return (
      <div className="toolbar" style={{width: TOOLBAR_WIDTH}}>
        <div className="buttons">
          <div className="button" title="Settings" onClick={this.handleSettingsButton}><span className="icon icon-cog" /></div>
          <div className={this.modalButtonClass("select")} title="Select" onClick={this.handleSelectionToolButton}><span className="icon icon-mouse-pointer" /></div>
          <div className={this.modalButtonClass("line")} title="Freehand Tool" onClick={this.handleLineDrawingToolButton}><span className="icon icon-pencil" style={{color: stroke}} /></div>
          <div className={this.modalButtonClass("vector")} style={{height: 30}} title="Line Tool" onClick={this.handleVectorToolButton}>{this.renderSVGIcon("vector")}</div>
          <div className={this.modalButtonClass("rectangle")} style={{height: 30}} title="Rectangle Tool" onClick={this.handleRectangleToolButton}>{this.renderSVGIcon("rectangle")}</div>
          <div className={this.modalButtonClass("ellipse")} style={{height: 30}} title="Ellipse Tool" onClick={this.handleEllipsisToolButton}>{this.renderSVGIcon("ellipse")}</div>
          <ToolbarFlyoutView selected={"image" === this.state.selectedButton}>
            {this.renderImageSetItems()}
          </ToolbarFlyoutView>
          <div className={this.modalButtonClass("text")} title="Text Tool" onClick={this.handleTextToolButton}>
            <span style={{color: stroke, fontSize, fontWeight, fontStyle}}>A</span>
          </div>
          <div className="button" title="Undo" onClick={this.handleUndoButton}><span className="icon icon-undo" /></div>
          <div className="button" title="Redo" onClick={this.handleRedoButton}><span className="icon icon-redo" /></div>
          <div className="button" title="Delete" onClick={this.handleDeleteButton}><span className="icon icon-bin" /></div>
        </div>
        {this.state.showSettings ? this.renderSettings() : null}
      </div>
    )
  }
}