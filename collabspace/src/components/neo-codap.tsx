import * as React from "react";
import NeoCodapApp from "../../../neo-codap/src/App";
import { addAttributeToDataSet, addCasesToDataSet, ICase, IDataSet }
        from "../../../neo-codap/src/data-manager/data-manager";
import {WorkspaceClient, WorkspaceClientInitRequest, WorkspaceClientPublishResponse, WorkspaceClientThumbnailWidth} from "../../../shared/workspace-client"
import { loadDataSetFromFirebase } from "../../../shared/firebase-dataset";
import * as firebase from "firebase";
import sizeMe from "react-sizeme";
const html2canvas = require("html2canvas");


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
  appDOMNodeRef: HTMLElement | null;

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
        return new Promise<WorkspaceClientPublishResponse>( (resolve, reject) => {
          const artifactBlobPromise = () => new Promise<Blob>((resolve, reject) => {
            // domtoimage.toBlob(this.appDOMNodeRef)
            // .then(function (blob: Blob) {
            //   blob ? resolve(blob) : reject("Couldn't get artifact blob from canvas!");
            // });

            if (this.appDOMNodeRef) {
              html2canvas(this.appDOMNodeRef).then((canvas: HTMLCanvasElement) => {
                const blobSaver = (blob:Blob) => {
                  blob ? resolve(blob) : reject("Couldn't get artifact blob from canvas!");
                }
                canvas.toBlob(blobSaver, "image/png");
              });
            }
            else {
              reject("No DOM node to render!");
            }
          })

          artifactBlobPromise()
            .then((blob) => {
              publication.saveArtifact({
                title: "Table/Graph",
                blob: blob
              })
              .then((artifact) => resolve({}))
              .catch(reject)
            })
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
          onDOMNodeRef={(ref: HTMLElement | null) => this.appDOMNodeRef = ref}
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
