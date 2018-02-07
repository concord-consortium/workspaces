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
  imageSetUrl: string|null
}

export class DrawingApp extends React.Component<DrawingAppProps, DrawingAppState> {

  constructor(props:DrawingAppProps){
    super(props)

    this.state = {
      authenticated: false,
      drawingRef: null,
      imageSetUrl: null
    }
  }

  componentWillMount() {
    const params = queryString.parse(window.location.search)
    const images = params.images || null

    if (params.drawing) {
      firebase.initializeApp(FirebaseConfig)
      firebase.auth().signInAnonymously()
        .then(() => {
          var drawingRef = firebase.database().ref("/drawings").child(params.drawing)
          this.setState({drawingRef, imageSetUrl: images, authenticated: true})
        })
        .catch((err) => {
          alert(err)
        })
    }
    else {
      const params:any = {drawing: uuid()}
      if (images) {
        params.images = images
      }
      window.location.search = queryString.stringify(params)
    }
  }

  render() {
    if (!this.state.authenticated) {
      return <div className="loading">Authenticating...</div>
    }
    if (this.state.drawingRef) {
      return <DrawingView firebaseRef={this.state.drawingRef} imageSetUrl={this.state.imageSetUrl} />
    }
    return <div className="loading">Loading...</div>
  }
}