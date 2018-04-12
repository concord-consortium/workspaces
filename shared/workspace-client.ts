import { FirebaseArtifact, FirebasePublication, FirebaseDataSetCreatorMap, FirebaseDataSet } from "../collabspace/src/lib/document"
import * as firebase from "firebase"
import { v4 as uuidV4 } from "uuid"
import { PortalTokens } from "../collabspace/src/lib/auth";
import { FirebaseWindowAttrsMap, FirebaseWindowDataSet } from "../collabspace/src/lib/window"
import * as html2canvas from "html2canvas"

const IFramePhoneFactory:IFramePhoneLib = require("iframe-phone")

export const WorkspaceClientThumbnailWidth = 50

export interface IFramePhoneLib {
  ParentEndpoint(iframe:HTMLIFrameElement, afterConnectedCallback?: (args:any) => void):  IFramePhoneParent
  getIFrameEndpoint: () => IFramePhoneChild
}

export interface WorkspaceDataSet {
  name: string
  ref: firebase.database.Reference
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

export const WorkspaceClientSnapshotRequestMessage = "WorkspaceClientSnapshotRequest"
export const WorkspaceClientSnapshotResponseMessage = "WorkspaceClientSnapshotResponse"

export type WorkspaceClientInitRequest = WorkspaceClientCollabSpaceInitRequest | WorkspaceClientStandaloneInitRequest

export interface WorkspaceClientCollabSpaceInitRequest {
  type: "collabspace"
  version: string
  id: string
  documentId: string
  readonly: boolean
  firebase: {
    config: any,
    dataPath: string,
    dataSet?: FirebaseWindowDataSet,
    dataSetsPath: string,
    attrsPath: string
  },
  tokens?: PortalTokens|null
}
export interface WorkspaceClientStandaloneInitRequest {
  type: "standalone"
  version: string
  id: string
  documentId: string
  readonly: boolean
}

export interface WorkspaceClientInitResponse {
}

export interface WorkspaceClientPublishRequest {
  publicationsPath: string
  artifactStoragePath: string
  annotationImageDataUrl: string|null
}

export interface WorkspaceClientPublishResponse {
}

export interface WorkspaceClientSnapshotRequest {
  snapshotPath: string
  annotationImageDataUrl: string|null
}

export interface WorkspaceClientSnapshotResponse {
  snapshotUrl: string
}


export interface WorkspaceClientConfig {
  init(req: WorkspaceClientInitRequest): WorkspaceClientInitResponse|Promise<WorkspaceClientInitResponse>
  publish?(publication: WorkspaceClientPublication): WorkspaceClientPublishResponse|Promise<WorkspaceClientPublishResponse>
  snapshot?(snapshot: WorkspaceClientSnapshot): WorkspaceClientSnapshotResponse|Promise<WorkspaceClientSnapshotResponse>
}

export class WorkspaceClient {
  windowId: string
  documentId: string
  config: WorkspaceClientConfig
  phone: IFramePhoneChild
  dataSet?: FirebaseWindowDataSet
  dataRef: firebase.database.Reference
  dataSetsRef: firebase.database.Reference
  protected dataSetCreatorsRef: firebase.database.Reference
  protected dataSetDataRef: firebase.database.Reference
  protected attrsRef: firebase.database.Reference

  constructor (config:WorkspaceClientConfig) {
    this.config = config
    this.phone = IFramePhoneFactory.getIFrameEndpoint()
    this.phone.addListener(WorkspaceClientInitRequestMessage, this.handleClientInit)
    this.phone.addListener(WorkspaceClientPublishRequestMessage, this.handleClientPublish)
    this.phone.addListener(WorkspaceClientSnapshotRequestMessage, this.handleClientSnapshot)
    this.phone.initialize()
  }

  handleClientInit = (req:WorkspaceClientInitRequest) => {
    this.windowId = req.id
    this.documentId = req.documentId
    if (req.type === "collabspace") {
      if (firebase.apps.length === 0) {
        firebase.initializeApp(req.firebase.config)
      }
      this.dataRef = firebase.database().ref(req.firebase.dataPath)
      this.dataSetsRef = firebase.database().ref(req.firebase.dataSetsPath)
      this.dataSet = req.firebase.dataSet
      const documentDataSet = this.dataSetsRef.child(this.documentId)
      this.dataSetCreatorsRef = documentDataSet.child("creators")
      this.dataSetDataRef = documentDataSet.child("data")
      this.attrsRef = firebase.database().ref(req.firebase.attrsPath)
    }

    const resp = this.config.init(req)
    Promise.resolve(resp).then((resp) => {
      this.phone.post(WorkspaceClientInitResponseMessage, resp)
    })
  }

  handleClientPublish = (req:WorkspaceClientPublishRequest) => {
    if (this.config.publish) {
      const publication = new WorkspaceClientPublication(this, req)
      const resp = this.config.publish(publication)
      Promise.resolve(resp).then((resp) => {
        this.phone.post(WorkspaceClientPublishResponseMessage, resp)
      })
    }
  }

  handleClientSnapshot = (req: WorkspaceClientSnapshotRequest) => {
    if (this.config.snapshot) {
      const snapshot = new WorkspaceClientSnapshot(this, req)
      const resp = this.config.snapshot(snapshot)
      Promise.resolve(resp).then((resp) => {
        this.phone.post(WorkspaceClientSnapshotResponseMessage, resp)
      })
    }
  }

  getDataSetRef() {
    if (this.dataSet) {
      return this.dataSetsRef.child(this.dataSet.documentId).child("data").child(this.dataSet.dataSetId)
    }
    return null
  }

  createDataSetRef() {
    const ref = this.dataSetCreatorsRef.push(this.windowId)
    this.selectDataSetRef(ref)
    return ref.key ? this.dataSetDataRef.child(ref.key) : null
  }

  selectDataSetRef(dataSetRef: firebase.database.Reference) {
    const windowDataSet:FirebaseWindowDataSet = {
      documentId: this.documentId,
      dataSetId: dataSetRef.key as string
    }
    this.attrsRef.child(this.windowId).child("dataSet").set(windowDataSet)
    return dataSetRef
  }

  listDataSets(callback:(dataSets: WorkspaceDataSet[]) => void) {
    let attrs:FirebaseWindowAttrsMap = {}
    let creators:FirebaseDataSetCreatorMap = {}
    let loadedAttrs = false
    let loadedCreators = false
    const onChange = () => {
      if (!loadedCreators || !loadedAttrs) {
        return
      }
      const dataSets: WorkspaceDataSet[] = []
      Object.keys(creators).forEach((dataSetId) => {
        const windowId = creators[dataSetId]
        const windowAttrs = attrs[windowId]
        if (windowAttrs) {
          dataSets.push({
            name: windowAttrs.title,
            ref: this.dataSetDataRef.child(dataSetId)
          })
        }
      })
      callback(dataSets)
    }
    const onCreatorsValueChange = this.dataSetCreatorsRef.on("value", (snapshot) => {
      creators = (snapshot ? snapshot.val() : {}) || {}
      loadedCreators = true
      onChange()
    })
    const onAttrsValueChange = this.attrsRef.on("value", (snapshot) => {
      attrs = (snapshot ? snapshot.val() : {}) || {}
      loadedAttrs = true
      onChange()
    })
    return () => {
      this.dataSetCreatorsRef.off("value", onCreatorsValueChange)
      this.attrsRef.off("value", onAttrsValueChange)
    }
  }
}

export interface SaveArtifactOptions {
  title: string
  canvas: HTMLCanvasElement
  mimeType?: string
  extension?: string
}

export class WorkspaceClientPublication {
  publicationsRef: firebase.database.Reference
  artifactsRef: firebase.database.Reference
  artifactsStoragePath: string
  annotationImageDataUrl: string|null

  constructor (client: WorkspaceClient, req:WorkspaceClientPublishRequest) {
    this.publicationsRef = firebase.database().ref(req.publicationsPath)
    this.artifactsRef = this.publicationsRef.child("windows").child(client.windowId).child("artifacts")
    this.artifactsStoragePath = req.artifactStoragePath
    this.annotationImageDataUrl = req.annotationImageDataUrl
  }

  createThumbnail(imageBlob:Blob) {
    return new Promise<Blob>((resolve, reject) => {
      const blobImage = document.createElement("img")
      blobImage.addEventListener("load", () => {
        const thumbnailCanvas:HTMLCanvasElement = document.createElement("canvas")
        thumbnailCanvas.width = WorkspaceClientThumbnailWidth
        thumbnailCanvas.height = WorkspaceClientThumbnailWidth * (blobImage.height / blobImage.width)

        const thumbnailContext = thumbnailCanvas.getContext("2d")
        if (!thumbnailContext) {
          return reject("Can't get thumbnail image context!")
        }
        thumbnailContext.drawImage(blobImage, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height)
        thumbnailCanvas.toBlob((thumbnailBlob:Blob) => {
          thumbnailBlob ? resolve(thumbnailBlob) : reject("Couldn't get thumbnail from canvas!")
        }, "image/png")
      })
      blobImage.src = URL.createObjectURL(imageBlob)
    })
  }

  saveThumbnail(thumbnailBlob:Blob, blobId:string) {
    return new Promise<string|undefined>((resolve, reject) => {
      const thumbnailStoragePath:string = `${this.artifactsStoragePath}/${blobId}-thumbnail.png`
      const thumbnailStorageRef = firebase.storage().ref(thumbnailStoragePath)
      thumbnailStorageRef
        .put(thumbnailBlob, {contentType: "image/png"})
        .then((snapshot) => thumbnailStorageRef.getDownloadURL())
        .then(resolve)
    })
  }

  saveArtifactBlob = (options: SaveArtifactOptions, blobId: string, blob: Blob, thumbnailUrl?:string) => {
    return new Promise<FirebaseArtifact>((resolve, reject) => {
      let {extension} = options
      const mimeType = options.mimeType || blob.type
      if (!extension) {
        const parts = mimeType.split("/")
        extension = parts[parts.length - 1]
      }

      const blobStoragePath:string = `${this.artifactsStoragePath}/${blobId}.${extension}`
      const blobStorageRef = firebase.storage().ref(blobStoragePath)
      blobStorageRef
        .put(blob, {contentType: mimeType})
        .then((snapshot) => blobStorageRef.getDownloadURL())
        .then((url) => {
          const artifact:FirebaseArtifact = {title: options.title, mimeType, url, thumbnailUrl}
          const artifactRef = this.artifactsRef.push(artifact)
          resolve(artifact)
        })
        .catch(reject)
    })
  }

  addAnnotations(canvas: HTMLCanvasElement) {
    return new Promise<HTMLCanvasElement>((resolve, reject) => {
      if (this.annotationImageDataUrl) {
        const annotationImage = new Image()
        annotationImage.addEventListener("load", () => {
          const context = canvas.getContext("2d")
          if (context) {
            context.drawImage(annotationImage, 0, 0)
          }
          resolve(canvas)
        })
        annotationImage.src = this.annotationImageDataUrl
      }
      else {
        resolve(canvas)
      }
    })
  }

  saveArtifact(options: SaveArtifactOptions) {
    const blobId = uuidV4()

    return new Promise<FirebaseArtifact>((resolve, reject) => {
      this.addAnnotations(options.canvas)
        .then((canvas) => {
          canvas.toBlob((blob) => {
            if (blob) {
              return this.createThumbnail(blob)
                .then((thumbnailBlob) => this.saveThumbnail(thumbnailBlob, blobId))
                .then((thumbnailUrl) => this.saveArtifactBlob(options, blobId, blob, thumbnailUrl))
                .then(resolve)
                .catch(reject)
            }
          }, "image/png")
        })
    })
  }
}

export class WorkspaceClientSnapshot {
  snapshotsPath: string
  annotationImageDataUrl: string|null

  constructor (client: WorkspaceClient, req:WorkspaceClientSnapshotRequest) {
    this.snapshotsPath = req.snapshotPath
    this.annotationImageDataUrl = req.annotationImageDataUrl
  }

  fromElement(element: HTMLElement|null) {
    return new Promise<WorkspaceClientSnapshotResponse>((resolve, reject) => {
      if (!element) {
        return reject("Nothing to snapshot!")
      }

      return html2canvas(element)
        .then((canvas: HTMLCanvasElement) => {
          return this.fromCanvas(canvas)
            .then(resolve)
            .catch(reject)
        })
        .catch(reject)
    })
  }

  addAnnotations(canvas: HTMLCanvasElement) {
    return new Promise<HTMLCanvasElement>((resolve, reject) => {
      if (this.annotationImageDataUrl) {
        const annotationImage = new Image()
        annotationImage.addEventListener("load", () => {
          const context = canvas.getContext("2d")
          if (context) {
            context.drawImage(annotationImage, 0, 0)
          }
          resolve(canvas)
        })
        annotationImage.src = this.annotationImageDataUrl
      }
      else {
        resolve(canvas)
      }
    })
  }

  fromCanvas(canvas: HTMLCanvasElement) {
    return new Promise<WorkspaceClientSnapshotResponse>((resolve, reject) => {
      try {
        this.addAnnotations(canvas)
          .then((canvas) => {
            canvas.toBlob((blob) => {
              if (blob) {
                const blobStorageRef = firebase.storage().ref(this.snapshotsPath)
                blobStorageRef
                  .put(blob, {contentType: "image/png"})
                  .then((snapshot) => blobStorageRef.getDownloadURL())
                  .then((snapshotUrl) => {
                    resolve({snapshotUrl})
                  })
                  .catch(reject)
              }
            }, "image/png");
          })
      }
      catch (err) {
        reject(err)
      }
    })
  }
}

