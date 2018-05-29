import * as React from "react"
import { DrawingView } from "../../../drawing/src/components/drawing-view"
import { WorkspaceClient, WorkspaceClientInitRequest, WorkspaceClientPublishResponse, WorkspaceClientThumbnailWidth, WorkspaceClientSnapshotResponse } from "../../../shared/workspace-client"
import * as firebase from "firebase"
import * as queryString from "query-string"

export interface DrawingToolComponentProps {
}

export interface DrawingToolComponentState {
  readonly: boolean
  drawingRef: firebase.database.Reference|null
  imageSetUrl: string|null
  captureScreenCallback: Function|null
  backgroundUrl: string|null
}

export class DrawingToolComponent extends React.Component<DrawingToolComponentProps, DrawingToolComponentState> {
  workspaceClient: WorkspaceClient

  constructor (props:DrawingToolComponentProps) {
    super(props)

    this.state = {
      readonly: false,
      drawingRef: null,
      imageSetUrl: this.getImageSetUrl(),
      backgroundUrl: this.getBackgroundUrl(),
      captureScreenCallback: null
    }
  }

  getImageSetUrl () {
    // for now force the MSU stamps as this parameter is not known in the teacher dashboard
    return "/drawing/imagesets/msu/msu.json"

    /*
    // if in an iframe get the image set url from the collaspace parameters
    let search = window.location.search
    try {
      if (window.self !== window.top) {
        search = window.top.location.search
      }
    } catch (e) {}
    return queryString.parse(search).drawingImageSet
    */
  }

  getBackgroundUrl() {
    return queryString.parse(window.location.search).backgroundUrl
  }

  componentDidMount() {

    this.workspaceClient = new WorkspaceClient({
      init: (req) => {
        this.setState({readonly: req.readonly, drawingRef: this.workspaceClient.dataRef})
        return {}
      },

      publish: (publication) => {
        return new Promise<WorkspaceClientPublishResponse>( (resolve, reject) => {
          this.captureScreen()
            .then((canvas) => {
              publication.saveArtifact({title: "Drawing", canvas})
                .then((artifact) => resolve({}))
                .catch(reject)
            })
            .catch(reject)
        })
      },

      snapshot: (snapshot) => {
        return new Promise<WorkspaceClientSnapshotResponse>((resolve, reject) => {
          this.captureScreen()
            .then((canvas) => {
              snapshot.fromCanvas(canvas)
                .then(resolve)
                .catch(reject)
            })
            .catch(reject)
        })
      }
    })
  }

  captureScreen() {
    return new Promise<HTMLCanvasElement>((resolve, reject) => {
      let captured = false
      const captureScreenCallback = (err:any, canvas:HTMLCanvasElement) => {
        if (captured) {
          return
        }

        captured = true
        this.setState({captureScreenCallback: null})

        if (err) {
          reject(err)
        }
        else {
          resolve(canvas)
        }
      }
      this.setState({captureScreenCallback})
    })
  }

  render() {
    if (this.state.drawingRef) {
      return <DrawingView
                readonly={this.state.readonly}
                firebaseRef={this.state.drawingRef}
                imageSetUrl={this.state.imageSetUrl}
                backgroundUrl={this.state.backgroundUrl}
                captureScreenCallback={this.state.captureScreenCallback}
              />
    }
    return <div className="loading">Loading...</div>
  }
}
