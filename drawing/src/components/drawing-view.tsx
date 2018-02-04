import * as React from "react"
import * as firebase from "firebase"
import { EditorView } from "./editor"
import { DrawingLayerView, ImageSetItem } from "./drawing-layer"
import { ToolbarView } from "./toolbar"
import { EventEmitter, Events } from "../lib/events"
import { TOOLBAR_WIDTH } from "./toolbar"

export type DrawingMode = "drawing" | "editing"

export interface DrawingViewProps {
  firebaseRef: firebase.database.Reference
  imageSetUrl: string|null
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

  componentDidMount() {
    this.toolbarElement = document.getElementsByClassName("firepad-toolbar")[0] as HTMLDivElement
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
    this.events.listen(Events.ImageToolSelected, () => this.setEditingMode(false))
  }

  render() {
    const editing = this.state.mode === "editing"
    return (
      <div>
        <ToolbarView mode={this.state.mode} events={this.events} imageSetItems={this.state.imageSetItems} />
        <div className="workspace" style={{left: TOOLBAR_WIDTH}}>
          <EditorView firebaseRef={this.props.firebaseRef} events={this.events} enabled={editing} />
          <DrawingLayerView firebaseRef={this.props.firebaseRef} events={this.events} enabled={!editing} />
        </div>
      </div>
    )
  }
}