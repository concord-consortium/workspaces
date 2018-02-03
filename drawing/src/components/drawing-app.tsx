import * as React from "react"
import * as queryString from "query-string"
import * as firebase from "firebase"
import { FirebaseConfig } from "../../../collabspace/src/lib/firebase-config"
import { v1 as uuid } from "uuid"
import { DrawingView } from "./drawing-view"

export interface DrawingAppProps {}

export interface DrawingAppState {
  authenticated: boolean
  drawingRef: firebase.database.Reference|null
}

export class DrawingApp extends React.Component<DrawingAppProps, DrawingAppState> {

  constructor(props:DrawingAppProps){
    super(props)

    this.parseHash = this.parseHash.bind(this)

    this.state = {
      authenticated: false,
      drawingRef: null
    }
  }

  componentWillMount() {
    firebase.initializeApp(FirebaseConfig)
    firebase.auth().signInAnonymously()
      .then(() => {
        this.setState({authenticated: true})

        this.parseHash()
        window.addEventListener("hashchange", this.parseHash)
      })
      .catch((err) => {
        alert(err)
      })
  }

  parseHash() {
    if (this.state.drawingRef) {
      this.state.drawingRef.off()
      this.setState({drawingRef: null})
    }

    const params = queryString.parse(window.location.hash)
    if (params.drawing) {
      var drawingRef = firebase.database().ref("/drawings").child(params.drawing)
      this.setState({drawingRef})
    }
    else {
      window.location.hash = `drawing=${uuid()}`
    }
  }

  render() {
    if (!this.state.authenticated) {
      return <div className="loading">Authenticating...</div>
    }
    if (this.state.drawingRef) {
      return <DrawingView firebaseRef={this.state.drawingRef} />
    }
    return <div className="loading">Loading...</div>
  }
}