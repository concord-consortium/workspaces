import { FirebaseArtifact, FirebasePublication } from "../collabspace/src/lib/document"
import * as firebase from "firebase"
import { v4 as uuidV4 } from "uuid"

const IFramePhoneFactory:IFramePhoneLib = require("iframe-phone")

export const WorkspaceClientThumbnailWidth = 50

export interface IFramePhoneLib {
  ParentEndpoint(iframe:HTMLIFrameElement, afterConnectedCallback?: (args:any) => void):  IFramePhoneParent
  getIFrameEndpoint: () => IFramePhoneChild
}

export type MessageContent = any
export type MessageType = string
export type Listener = (args:any)=>void

export interface IFramePhoneChild {
  post(type:MessageType, content:MessageContent): void
  addListener(messageName:string, listener:Listener): void
  disconnect(): void
  connected: boolean
  initialize():void
  getListenerNames(): Listener[]
  removeAllListeners(): void
}

export interface IFramePhoneParent {
  post(type:MessageType, content:MessageContent): void
  addListener(messageName:string, listener:Listener): void
  removeListener(messageName:string): void
  disconnect(): void
  connected: boolean
  getTargetWindow(): Window
  targetOrigin: string
}


export const WorkspaceClientInitRequestMessage = "WorkspaceClientInitRequest"
export const WorkspaceClientInitResponseMessage = "WorkspaceClientInitResponse"

export const WorkspaceClientPublishRequestMessage = "WorkspaceClientPublishRequest"
export const WorkspaceClientPublishResponseMessage = "WorkspaceClientPublishResponse"

export type WorkspaceClientInitRequest = WorkspaceClientCollabSpaceInitRequest | WorkspaceClientStandaloneInitRequest

export interface WorkspaceClientCollabSpaceInitRequest {
  type: "collabspace"
  version: string
  id: string
  readonly: boolean
  firebase: {
    config: any,
    dataPath: string
  }
}
export interface WorkspaceClientStandaloneInitRequest {
  type: "standalone"
  version: string
  id: string
  readonly: boolean
}

export interface WorkspaceClientInitResponse {
}

export interface WorkspaceClientPublishRequest {
  publicationsPath: string
  artifactStoragePath: string
}

export interface WorkspaceClientPublishResponse {
}

export interface WorkspaceClientConfig {
  init(req: WorkspaceClientInitRequest): WorkspaceClientInitResponse|Promise<WorkspaceClientInitResponse>
  publish(publication: WorkspaceClientPublication): WorkspaceClientPublishResponse|Promise<WorkspaceClientPublishResponse>
}

export class WorkspaceClient {
  windowId: string
  config: WorkspaceClientConfig
  phone: IFramePhoneChild
  dataRef: firebase.database.Reference

  constructor (config:WorkspaceClientConfig) {
    this.config = config
    this.phone = IFramePhoneFactory.getIFrameEndpoint()
    this.phone.addListener(WorkspaceClientInitRequestMessage, this.clientInit.bind(this))
    this.phone.addListener(WorkspaceClientPublishRequestMessage, this.clientPublish.bind(this))
    this.phone.initialize()
  }

  clientInit(req:WorkspaceClientInitRequest) {
    this.windowId = req.id
    if (req.type === "collabspace") {
      firebase.initializeApp(req.firebase.config)
      this.dataRef = firebase.database().ref(req.firebase.dataPath)
    }

    const resp = this.config.init(req)
    Promise.resolve(resp).then((resp) => {
      this.phone.post(WorkspaceClientInitResponseMessage, resp)
    })
  }

  clientPublish(req:WorkspaceClientPublishRequest) {
    const publication = new WorkspaceClientPublication(this, req)
    const resp = this.config.publish(publication)
    Promise.resolve(resp).then((resp) => {
      this.phone.post(WorkspaceClientPublishResponseMessage, resp)
    })
  }
}

export interface SaveArtifactBlobOptions {
  title: string
  blob: Blob
  mimeType: string
  extension?: string
  thumbnailPNGBlob?: Blob
}

export class WorkspaceClientPublication {
  publicationsRef: firebase.database.Reference
  artifactsRef: firebase.database.Reference
  artifactsStoragePath: string

  constructor (client: WorkspaceClient, req:WorkspaceClientPublishRequest) {
    this.publicationsRef = firebase.database().ref(req.publicationsPath)
    this.artifactsRef = this.publicationsRef.child("windows").child(client.windowId).child("artifacts")
    this.artifactsStoragePath = req.artifactStoragePath
  }

  saveArtifactBlob(options: SaveArtifactBlobOptions) {
    return new Promise<FirebaseArtifact>((resolve, reject) => {
      const {title, blob, mimeType, thumbnailPNGBlob} = options
      let {extension} = options

      if (!extension) {
        const parts = mimeType.split("/")
        extension = parts[parts.length - 1]
      }

      const blobId = uuidV4()

      const saveBlob = (thumbnailUrl?:string) => {
        const blobStoragePath:string = `${this.artifactsStoragePath}/${blobId}.${extension}`
        const blobStorageRef = firebase.storage().ref(blobStoragePath)
        blobStorageRef
          .put(blob, {contentType: mimeType})
          .then((snapshot) => blobStorageRef.getDownloadURL())
          .then((url) => {
            const artifact:FirebaseArtifact = {title, mimeType, url, thumbnailUrl}
            const artifactRef = this.artifactsRef.push(artifact)
            resolve(artifact)
          })
          .catch(reject)
      }

      if (thumbnailPNGBlob) {
        const thumbnailStoragePath:string = `${this.artifactsStoragePath}/${blobId}-thumbnail.png`
        const thumbnailStorageRef = firebase.storage().ref(thumbnailStoragePath)
        thumbnailStorageRef
          .put(thumbnailPNGBlob, {contentType: "image/png"})
          .then((snapshot) => thumbnailStorageRef.getDownloadURL())
          .then(saveBlob)
          .catch(reject)
      }
      else {
        saveBlob()
      }
    })
  }
}