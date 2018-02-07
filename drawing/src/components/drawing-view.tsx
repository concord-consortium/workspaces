import * as React from "react"
import * as firebase from "firebase"
import { EditorView } from "./editor"
import { DrawingLayerView, ImageSetItem } from "./drawing-layer"
import { ToolbarView } from "./toolbar"
import { EventEmitter, Events } from "../lib/events"
import { TOOLBAR_WIDTH } from "./toolbar"
import * as html2canvas from "html2canvas"

export type DrawingMode = "drawing" | "editing"

export interface DrawingViewProps {
  firebaseRef: firebase.database.Reference
  imageSetUrl: string|null
  readonly?: boolean
  captureScreenCallback?: Function|null
}

export interface DrawingViewState {
  mode: DrawingMode
  imageSetItems: ImageSetItem[]
}

export class DrawingView extends React.Component<DrawingViewProps, DrawingViewState> {
  events: EventEmitter
  toolbarElement: HTMLDivElement

  constructor(props:DrawingViewProps){
    super(props)

    this.state = {
      mode: "editing",
      imageSetItems: []
    }

    if (this.props.imageSetUrl) {
      this.loadImageSet(this.props.imageSetUrl)
    }

    this.events = new EventEmitter()
    this.addEventListeners()
  }

  refs: {
    workspace: HTMLDivElement
  }

  componentDidMount() {
    this.toolbarElement = document.getElementsByClassName("firepad-toolbar")[0] as HTMLDivElement
  }

  componentWillReceiveProps(nextProps:DrawingViewProps) {
    if (nextProps.captureScreenCallback && (nextProps.captureScreenCallback !== this.props.captureScreenCallback)) {
      debugger
      this.captureScreen(nextProps.captureScreenCallback)
    }
  }

  loadImageSet(imageSetUrl:string) {
    const urlParser = document.createElement("A") as HTMLAnchorElement
    urlParser.href = imageSetUrl
    const pathParts = urlParser.pathname.split("/")
    pathParts.pop()
    const baseUrl = `${urlParser.protocol}//${urlParser.host}${pathParts.join("/")}/`
    const httpRegex = /^https?:/i

    const xhr = new XMLHttpRequest()
    xhr.addEventListener("load", () => {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          try {
            const imageSetItems = (JSON.parse(xhr.responseText) as ImageSetItem[]).filter((item) => {
              if (item.src && !httpRegex.test(item.src)) {
                item.src = `${baseUrl}${item.src}`
              }
              return item.src && item.width && item.height
            })
            this.setState({imageSetItems})
          }
          catch (e) {
            alert("Cannot parse image set at " + imageSetUrl + ": " + e.toString())
          }
        }
        else {
          alert("Cannot load image set at " + imageSetUrl + ": " + xhr.responseText)
        }
      }
    })
    xhr.open("GET", imageSetUrl)
    xhr.send()
  }

  setToolbarOpacity(opacity:string) {
    if (this.toolbarElement) {
      this.toolbarElement.style.opacity = opacity
    }
  }

  setEditingMode(editing:boolean) {
    this.setToolbarOpacity(editing ? "1" : "0.5")
    this.setState({mode: editing ? "editing" : "drawing"})
  }

  captureScreen(callback:Function) {
    const restoreToolbarOpacity = () => this.setToolbarOpacity(this.state.mode === "editing" ? "1" : "0.5")
    this.setToolbarOpacity("0.01") // 0 screws up the font rendering somehow
    html2canvas(this.refs.workspace, {allowTaint: true})
      .then((canvas) => {
        restoreToolbarOpacity()
        callback(null, canvas)
      })
      .catch((e) => {
        restoreToolbarOpacity()
        callback(e)
      })
  }

  addEventListeners() {
    this.events.listen(Events.EditModeSelected, () => this.setEditingMode(true))
    this.events.listen(Events.LineDrawingToolSelected, () => this.setEditingMode(false))
    this.events.listen(Events.SelectionToolSelected, () => this.setEditingMode(false))
    this.events.listen(Events.ImageToolSelected, () => this.setEditingMode(false))
    this.events.listen(Events.RectangleToolSelected, () => this.setEditingMode(false))
    this.events.listen(Events.EllipseToolSelected, () => this.setEditingMode(false))
  }

  render() {
    const editing = this.state.mode === "editing"
    return (
      <div>
        <ToolbarView mode={this.state.mode} events={this.events} imageSetItems={this.state.imageSetItems} />
        <div className="workspace" ref="workspace" style={{left: TOOLBAR_WIDTH}}>
          <EditorView firebaseRef={this.props.firebaseRef} events={this.events} enabled={editing} readonly={this.props.readonly} />
          <DrawingLayerView firebaseRef={this.props.firebaseRef} events={this.events} enabled={!editing} imageSetItems={this.state.imageSetItems} />
        </div>
        {this.props.readonly ? <div className="read-only-blocker" /> : null}
      </div>
    )
  }
}