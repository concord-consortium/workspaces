import * as React from "react"
import { DrawingView } from "../../../drawing/src/components/drawing-view"
import { WorkspaceClient, WorkspaceClientInitRequest, WorkspaceClientPublishResponse, WorkspaceClientThumbnailWidth } from "../../../shared/workspace-client"
import * as firebase from "firebase"
import * as queryString from "query-string"

export interface DrawingToolComponentProps {
}

export interface DrawingToolComponentState {
  readonly: boolean
  drawingRef: firebase.database.Reference|null
  imageSetUrl: string|null
  captureScreenCallback: Function|null
}

export class DrawingToolComponent extends React.Component<DrawingToolComponentProps, DrawingToolComponentState> {
  workspaceClient: WorkspaceClient

  constructor (props:DrawingToolComponentProps) {
    super(props)

    this.state = {
      readonly: false,
      drawingRef: null,
      imageSetUrl: this.getImageSetUrl(),
      captureScreenCallback: null
    }
  }

  getImageSetUrl () {
    // if in an iframe get the image set url from the collaspace parameters
    let search = window.location.search
    try {
      if (window.self !== window.top) {
        search = window.top.location.search
      }
    } catch (e) {}
    return queryString.parse(search).drawingImageSet
  }

  componentDidMount() {

    this.workspaceClient = new WorkspaceClient({
      init: (req) => {
        this.setState({readonly: req.readonly, drawingRef: this.workspaceClient.dataRef})
        return {}
      },

      publish: (publication) => {
        return new Promise<WorkspaceClientPublishResponse>( (resolve, reject) => {
          const captureScreenCallback = (err:any, canvas:HTMLCanvasElement) => {
            this.setState({captureScreenCallback: null})
            if (err) {
              reject(err)
            }
            else {
              canvas.toBlob((blob:Blob) => {
                if (!blob) {
                  return reject("Couldn't get drawing from canvas!")
                }
                publication.saveArtifact({title: "Drawing", blob})
                .then((artifact) => resolve({}))
                .catch(reject)
              }, "image/png")
            }
          }
          this.setState({captureScreenCallback})
        })
      }
    })
  }

  render() {
    if (this.state.drawingRef) {
      return <DrawingView readonly={this.state.readonly} firebaseRef={this.state.drawingRef} imageSetUrl={this.state.imageSetUrl} captureScreenCallback={this.state.captureScreenCallback} />
    }
    return <div className="loading">Loading...</div>
  }
}
