import * as React from "react"
import * as firebase from "firebase"
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
  imageSetItems: ImageSetItem[]
}

export class DrawingView extends React.Component<DrawingViewProps, DrawingViewState> {
  events: EventEmitter
  toolbarElement: HTMLDivElement

  constructor(props:DrawingViewProps){
    super(props)

    this.state = {
      imageSetItems: []
    }

    if (this.props.imageSetUrl) {
      this.loadImageSet(this.props.imageSetUrl)
    }

    this.events = new EventEmitter()
  }

  refs: {
    workspace: HTMLDivElement
  }

  componentDidMount() {
    this.toolbarElement = document.getElementsByClassName("firepad-toolbar")[0] as HTMLDivElement
  }

  componentWillReceiveProps(nextProps:DrawingViewProps) {
    if (nextProps.captureScreenCallback && (nextProps.captureScreenCallback !== this.props.captureScreenCallback)) {
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
    xhr.open("GET", imageSetUrl, true)
    xhr.send()
  }

  captureScreen(callback:Function) {
    html2canvas(this.refs.workspace, {allowTaint: true})
      .then((canvas) => {
        callback(null, canvas)
      })
      .catch((e) => {
        callback(e)
      })
  }

  render() {
    return (
      <div>
        <div className="workspace" ref="workspace" style={{left: TOOLBAR_WIDTH}}>
          <DrawingLayerView firebaseRef={this.props.firebaseRef} readonly={this.props.readonly} events={this.events} imageSetItems={this.state.imageSetItems} />
        </div>
        <ToolbarView events={this.events} imageSetItems={this.state.imageSetItems} />
        {this.props.readonly ? <div className="read-only-blocker" /> : null}
      </div>
    )
  }
}