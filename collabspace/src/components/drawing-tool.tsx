import * as React from "react"
import {WorkspaceClient, WorkspaceClientInitRequest, WorkspaceClientPublishResponse, WorkspaceClientThumbnailWidth} from "../../../shared/workspace-client"
import * as firebase from "firebase"
import * as _ from "lodash"

declare const DrawingTool:any

export class FirebaseStorage {
  dataRef: firebase.database.Reference
  readonly: boolean
  loadFunction: Function|null

  constructor (dataRef: firebase.database.Reference, readonly: boolean) {
    this.dataRef = dataRef
    this.readonly = readonly

    dataRef.on("value", (snapshot:firebase.database.DataSnapshot) => {
      const data = snapshot.val() || {}
      if (!_.isEmpty(data) && this.loadFunction) {
        this.loadFunction(data)
      }
    })
  }

  save(data:any) {
    if (!this.readonly) {
      this.dataRef.set(typeof data == 'string' ? JSON.parse(data) : data)
    }
  }

  setLoadFunction(loadFunction: Function) {
    this.loadFunction = loadFunction
  }
}

export interface DrawingToolComponentProps {
}

export interface DrawingToolComponentState {
}

export class DrawingToolComponent extends React.Component<DrawingToolComponentProps, DrawingToolComponentState> {
  drawingTool: any|null
  resizeTimeout: number|null
  WorkspaceClient: WorkspaceClient

  constructor (props:DrawingToolComponentProps) {
    super(props)
    this.state = {}
    this.debounceResize = this.debounceResize.bind(this)
    this.resize = this.resize.bind(this)
  }

  refs: {
    container: HTMLDivElement
  }

  componentDidMount() {
    this.drawingTool = new DrawingTool("#drawing-tool-container", {
      firebaseKey: 'codraw',
      stamps: {
        'coins': ['vendor/drawing-tool/pouch-30px.png','vendor/drawing-tool/coin-25px.png', 'vendor/drawing-tool/equals-30px.png']
      },
      parseSVG: true
    })
    this.resize()
    window.addEventListener("resize", this.debounceResize, false)

    this.WorkspaceClient = new WorkspaceClient({
      init: (req) => {
        const firebaseStorage = new FirebaseStorage(this.WorkspaceClient.dataRef, req.readonly)
        this.drawingTool.addStore(firebaseStorage)
        return {}
      },

      publish: (publication) => {
        const mimeType = "image/png"
        return new Promise<WorkspaceClientPublishResponse>( (resolve, reject) => {
          const drawingCanvas:HTMLCanvasElement = this.drawingTool.canvas.getElement()

          const drawingBlobPromise = new Promise<Blob>((resolve, reject) => {
            const blobSaver = (blob:Blob) => {
              blob ? resolve(blob) : reject("Couldn't get drawing from canvas!")
            }
            drawingCanvas.toBlob(blobSaver, mimeType)
          })

          const thumbnailBlobPromise = new Promise<Blob>((resolve, reject) => {
            const thumbnailCanvas:HTMLCanvasElement = document.createElement("canvas")
            thumbnailCanvas.width = WorkspaceClientThumbnailWidth
            thumbnailCanvas.height = WorkspaceClientThumbnailWidth * (drawingCanvas.height / drawingCanvas.width)

            const thumbnailContext = thumbnailCanvas.getContext("2d")
            if (thumbnailContext) {
              thumbnailContext.drawImage(drawingCanvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height)
              const blobSaver = (blob:Blob) => {
                blob ? resolve(blob) : reject("Couldn't get thumbnail drawing from canvas!")
              }
              thumbnailCanvas.toBlob(blobSaver, "image/png")
            }
            else {
              reject("Can't get thumbnail canvas!")
            }
          })

          Promise.all([drawingBlobPromise, thumbnailBlobPromise])
            .then(([drawingBlob, thumbnailPNGBlob]) => {
              publication.saveArtifactBlob({
                title: "Drawing",
                blob: drawingBlob,
                mimeType,
                thumbnailPNGBlob
              })
              .then((artifact) => resolve({}))
              .catch(reject)
            })
            .catch(reject)
        })
      }
    })
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.debounceResize, false)
  }

  shouldComponentUpdate() {
    return false
  }

  debounceResize() {
    if (!this.resizeTimeout) {
      this.resizeTimeout = window.setTimeout(() => {
        this.resizeTimeout = null
        this.resize()
      }, 300)
    }
  }

  resize() {
    if (this.drawingTool) {
      const {container} = this.refs
      this.drawingTool.setDimensions(container.clientWidth - 65, container.clientHeight)
      this.drawingTool.canvas.renderAll()
    }
  }

  render() {
    return (
      <div className="drawing-tool-wrapper">
        <div ref="container" id="drawing-tool-container" />
      </div>
    )
  }
}
