import * as React from "react";
import NeoCodapApp from "../../../neo-codap/src/App";
import { addAttributeToDataSet, addCasesToDataSet, ICase, IDataSet }
        from "../../../neo-codap/src/data-manager/data-manager";
import {WorkspaceClient, WorkspaceClientInitRequest, WorkspaceClientPublishResponse, WorkspaceClientThumbnailWidth} from "../../../shared/workspace-client"
import { loadDataSetFromFirebase } from "../../../shared/firebase-dataset";
import * as firebase from "firebase";
import sizeMe from "react-sizeme";
// import html2canvas from "html2canvas";
// var html2canvas = require("html2canvas");
// import domtoimage from 'dom-to-image';
// var domtoimage = require('dom-to-image');


interface ISizeMeSize {
  width:number|null;
  height:number|null;
}

interface NeoCodapProps {
  size: ISizeMeSize;
}

interface NeoCodapState {
  dataSet?: IDataSet;
}

class NeoCodapComponent extends React.Component<NeoCodapProps, NeoCodapState> {
  workspaceClient: WorkspaceClient;
  dataSetRef?: firebase.database.Reference;
  appDOMNodeRef: HTMLElement;

  constructor (props:NeoCodapProps) {
    super(props)
    this.state = {}
  }

  componentDidMount() {
    this.workspaceClient = new WorkspaceClient({
      init: (req) => {
        this.dataSetRef = this.workspaceClient.dataRef &&
                            this.workspaceClient.dataRef.child('data');
        if (this.dataSetRef) {
          loadDataSetFromFirebase(this.dataSetRef, req.readonly)
            .then((dataSet) => {
              this.setState({ dataSet });
            });
        }
        return {}
      },

      publish: (publication) => {
        const mimeType = "image/png"
        return new Promise<WorkspaceClientPublishResponse>( (resolve, reject) => {
          const thumbnailBlobPromise = new Promise<Blob>((resolve, reject) => {
            const thumbnailCanvas:HTMLCanvasElement = document.createElement("canvas"),
                  aspectRatio = this.props.size.width && this.props.size.height
                                  ? this.props.size.width / this.props.size.height
                                  : 1;
            thumbnailCanvas.width = WorkspaceClientThumbnailWidth;
            thumbnailCanvas.height = WorkspaceClientThumbnailWidth / aspectRatio;

            const options = {
              canvas: thumbnailCanvas,
              width: thumbnailCanvas.width,
              height: thumbnailCanvas.height
            };
            // domtoimage.toBlob(this.appDOMNodeRef)
            // .then(function (blob: Blob) {
            //   blob ? resolve(blob) : reject("Couldn't get thumbnail drawing from canvas!");
            // });
        
            // html2canvas(this.appDOMNodeRef, options).then((canvas: HTMLCanvasElement) => {
            //   const blobSaver = (blob:Blob) => {
            //     blob ? resolve(blob) : reject("Couldn't get thumbnail drawing from canvas!");
            //   }
            //   canvas.toBlob(blobSaver, "image/png");
            // });
            reject("Couldn't get thumbnail drawing from canvas!");
          })

          Promise.all([thumbnailBlobPromise])
            .then(([thumbnailPNGBlob]) => {
              publication.saveArtifactBlob({
                title: "Table/Graph",
                blob: thumbnailPNGBlob,
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

  render() {
    const { dataSet } = this.state;
    return (
      <div className="neo-codap-wrapper">
        <NeoCodapApp
          dataSet={dataSet}
          onDOMNodeRef={(ref: HTMLElement) => this.appDOMNodeRef = ref}
        />
      </div>
    )
  }
}

const sizeMeConfig = {
  monitorWidth: true,
  monitorHeight: true,
  noPlaceholder: true
};
export default sizeMe(sizeMeConfig)(NeoCodapComponent);