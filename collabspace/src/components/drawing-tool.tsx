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
  readonly: boolean
}

export class DrawingToolComponent extends React.Component<DrawingToolComponentProps, DrawingToolComponentState> {
  drawingTool: any|null
  resizeTimeout: number|null
  WorkspaceClient: WorkspaceClient

  constructor (props:DrawingToolComponentProps) {
    super(props)
    this.state = {
      readonly: false
    }
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
    this.handleResize()
    window.addEventListener("resize", this.handleDebounceResize, false)

    this.WorkspaceClient = new WorkspaceClient({
      init: (req) => {
        this.setState({readonly: req.readonly})
        const firebaseStorage = new FirebaseStorage(this.WorkspaceClient.dataRef, req.readonly)
        this.drawingTool.addStore(firebaseStorage)
        return {}
      },

      publish: (publication) => {
        return new Promise<WorkspaceClientPublishResponse>( (resolve, reject) => {
          const canvas:HTMLCanvasElement = this.drawingTool.canvas.getElement()
          publication.saveArtifact({title: "Drawing", canvas})
            .then((artifact) => resolve({}))
            .catch(reject)
        })
      },

      snapshot: (snapshot) => {
        return snapshot.fromElement(this.drawingTool.canvas.getElement())
      }
    })
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.handleDebounceResize, false)
  }

  handleDebounceResize = () => {
    if (!this.resizeTimeout) {
      this.resizeTimeout = window.setTimeout(() => {
        this.resizeTimeout = null
        this.handleResize()
      }, 300)
    }
  }

  handleResize = () => {
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
