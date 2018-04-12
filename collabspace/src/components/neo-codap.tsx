import * as React from "react";
import NeoCodapApp from "../../../neo-codap/src/App";
import { addAttributeToDataSet, addCasesToDataSet, ICase, IDataSet }
        from "../../../neo-codap/src/data-manager/data-manager";
import {WorkspaceClient, WorkspaceClientInitRequest, WorkspaceClientPublishResponse, WorkspaceClientThumbnailWidth, WorkspaceDataSet} from "../../../shared/workspace-client"
import { loadDataSetFromFirebase } from "../../../shared/firebase-dataset";
import * as firebase from "firebase";
import sizeMe from "react-sizeme";
const html2canvas = require("html2canvas");
import * as queryString from 'query-string';
import { IAppComponentData, AppComponentData, createDefaultAppComponentData } from "../../../neo-codap/src/app-data";
import { applySnapshot, getSnapshot, onSnapshot } from "mobx-state-tree";

interface ISizeMeSize {
  width:number|null;
  height:number|null;
}

interface NeoCodapProps {
  size: ISizeMeSize;
}

interface NeoCodapState {
  mode: string
  readonly: boolean
  dataSet?: IDataSet
  appComponentData?: IAppComponentData
  loadedWorkspaceDataSets: boolean
  workspaceDataSets: WorkspaceDataSet[]
}

class NeoCodapComponent extends React.Component<NeoCodapProps, NeoCodapState> {
  workspaceClient: WorkspaceClient;
  appDOMNodeRef: HTMLElement | null;
  cancelListDataSets?: Function

  constructor (props:NeoCodapProps) {
    super(props)

    const urlParams = queryString.parse(location.search)
    this.state = {
      mode: urlParams.mode != null ? urlParams.mode : 'all',
      readonly: false,
      loadedWorkspaceDataSets: false,
      workspaceDataSets: []
    }
  }

  componentDidMount() {
    this.workspaceClient = new WorkspaceClient({
      init: (req) => {
        this.setState({readonly: req.readonly}, () => {
          this.loadAppComponentData();
          if (req.type === "collabspace") {
            this.determineDataSet();
          }
        })
        return {}
      },

      publish: (publication) => {
        return new Promise<WorkspaceClientPublishResponse>( (resolve, reject) => {
          if (this.appDOMNodeRef) {
            html2canvas(this.appDOMNodeRef).then((canvas: HTMLCanvasElement) => {
              publication.saveArtifact({title: "Table/Graph", canvas})
                .then((artifact) => resolve({}))
                .catch(reject)
            });
          }
          else {
            reject("No DOM node to render!");
          }
        })
      },

      snapshot: (snapshot) => {
        return snapshot.fromElement(this.appDOMNodeRef)
      }
    })
  }

  componentWillUnmount() {
    this.workspaceClient.dataRef.off()
  }

  loadAppComponentData() {
    const {dataRef} = this.workspaceClient
    dataRef.once("value", (snapshot) => {
      // ensure there is initial data
      const appComponentData = createDefaultAppComponentData()
      let initialAppComponentData:IAppComponentData|null = snapshot.val()
      if (initialAppComponentData) {
        applySnapshot(appComponentData, initialAppComponentData)
      }
      else {
        dataRef.set(getSnapshot(appComponentData))
      }

      // sync local changes to the data to Firebase
      let localChange = true
      onSnapshot(appComponentData, (updatedAppData) => {
        if (localChange) {
          dataRef.set(updatedAppData)
        }
      })

      this.setState({appComponentData}, () => {

        // listen for changes at Firebase to update the local state
        dataRef.on("value", (snapshot) => {
          const newAppComponentData:IAppComponentData = (snapshot && snapshot.val()) || getSnapshot(createDefaultAppComponentData())
          localChange = false
          applySnapshot(appComponentData, newAppComponentData)
          localChange = true
        })
      })
    })
  }

  determineDataSet() {
    let dataSetRef = this.workspaceClient.getDataSetRef()
    if (!dataSetRef && (this.state.mode === "graph")) {
      this.cancelListDataSets = this.workspaceClient.listDataSets((workspaceDataSets) => {
        if (workspaceDataSets.length === 1) {
          this.handleSelectedWorkspaceDataSet(workspaceDataSets[0])
        }
        else {
          this.setState({workspaceDataSets, loadedWorkspaceDataSets: true})
        }
      })
    }
    else {
      dataSetRef = dataSetRef || this.workspaceClient.createDataSetRef()
      if (dataSetRef) {
        this.loadDataSet(dataSetRef)
      }
    }
  }

  loadDataSet(dataSetRef: firebase.database.Reference) {
    loadDataSetFromFirebase(dataSetRef, this.state.readonly)
      .then((dataSet) => {
        this.setState({ dataSet });
      });
  }

  handleSelectedWorkspaceDataSet = (workspaceDataSet: WorkspaceDataSet) => {
    if (this.cancelListDataSets) {
      this.cancelListDataSets()
      this.cancelListDataSets = undefined
    }
    this.loadDataSet(this.workspaceClient.selectDataSetRef(workspaceDataSet.ref))
  }

  renderSelectDataSet() {
    const {loadedWorkspaceDataSets, workspaceDataSets} = this.state
    if (!loadedWorkspaceDataSets) {
      return "Loading..."
    }
    if (workspaceDataSets.length === 0) {
      return "Sorry, there are no datasets available.  Try creating a table."
    }
    const items = workspaceDataSets.map((workspaceDataSet, index) => {
      return <li key={index} onClick={() => this.handleSelectedWorkspaceDataSet(workspaceDataSet)}>{workspaceDataSet.name}</li>
    })
    return (
      <div className="select-dataset">
        <h1>Select Dataset</h1>
        <ul>
          {items}
        </ul>
      </div>
    )
  }

  render() {
    const { dataSet, appComponentData } = this.state
    if (!dataSet) {
      return (
        <div className="neo-codap-wrapper centered">
          {this.renderSelectDataSet()}
        </div>
      )
    }

    return (
      <div className="neo-codap-wrapper">
        <NeoCodapApp
          dataSet={dataSet}
          appComponentData={appComponentData}
          onDOMNodeRef={(ref: HTMLElement | null) => this.appDOMNodeRef = ref}
          inCollabSpace={true}
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
