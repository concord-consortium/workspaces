import { Window, WindowMap, IFrame, FirebaseWindowAttrs } from "./window"
import { Document, FirebasePublication, FirebaseDataSet } from "./document"
import { FirebaseWindowAttrsMap, FirebaseWindows, FirebaseWindowDataSet } from "./window"
import { FirebaseConfig } from "./firebase-config"
import { IFramePhoneLib,
  IFramePhoneParent,
  MessageContent,
  MessageType,
  Listener,
  WorkspaceClientInitRequestMessage,
  WorkspaceClientInitResponseMessage,
  WorkspaceClientInitRequest,
  WorkspaceClientInitResponse,
  WorkspaceClientSnapshotRequestMessage,
  WorkspaceClientSnapshotResponseMessage,
  WorkspaceClientSnapshotRequest,
  WorkspaceClientSnapshotResponse
 } from "../../../shared/workspace-client"

 const IFramePhoneFactory:IFramePhoneLib = require("iframe-phone")

import * as firebase from "firebase"
import { PortalOffering, PortalTokens } from "./auth";
import { getDocumentRef, getRelativeRefPath, getDocumentRefByClass } from "./refs"
import { NonPrivateWindowParams, PublicationWindowOptions } from "../components/workspace";
import { LogManager } from "../../../shared/log-manager"
import { assign } from "lodash"

export interface AddWindowLogParams {
  name: string
  params?: any
}

export interface AddWindowParams {
  url: string
  title: string
  ownerId?: string
  iframeData?: any
  annotations?: any
  dataSet?: FirebaseWindowDataSet
  createNewDataSet?: boolean
  log?: AddWindowLogParams
}

export enum DragType { GrowLeft, GrowRight, GrowUp, GrowDown, GrowDownRight, GrowDownLeft, Position, None }
export interface DragInfo {
  window: Window|null
  starting?: {
    x: number
    y: number
    top: number
    left: number
    width: number
    height: number
  }
  type: DragType
}

export interface OrderedWindow {
  order: number
  window: Window
}

export interface WindowManagerState {
  allOrderedWindows: OrderedWindow[]
  minimizedWindows: Window[]
  topWindow: Window|null
}

export type WindowManagerStateChangeFn = (state:WindowManagerState) => void

export interface WindowManagerSettings {
  document: Document
  onStateChanged: WindowManagerStateChangeFn
  syncChanges: boolean
  tokens: PortalTokens|null
  nonPrivateWindow: (nonPrivateWindowParams: NonPrivateWindowParams) => boolean
}

export interface FirebaseOrderMap {
  [key: string]: number|null
}
export interface InvertedFirebaseOrderMap {
  [key: string]: string
}

export class WindowManager {
  windows: WindowMap
  document: Document
  onStateChanged: WindowManagerStateChangeFn
  state: WindowManagerState
  attrsRef: firebase.database.Reference
  orderRef: firebase.database.Reference
  minimizedOrderRef: firebase.database.Reference
  dragInfo: DragInfo
  syncChanges: boolean
  windowOrder: string[]
  minimizedWindowOrder: string[]
  lastAttrsQuery: firebase.database.Query
  tokens: PortalTokens|null
  nonPrivateWindow: (nonPrivateWindowParams: NonPrivateWindowParams) => boolean
  logManager: LogManager
  listenOnlyForTitleAttrChanges: boolean

  constructor (settings: WindowManagerSettings) {
    this.document = settings.document
    this.onStateChanged = settings.onStateChanged
    this.syncChanges = settings.syncChanges
    this.tokens = settings.tokens
    this.nonPrivateWindow = settings.nonPrivateWindow

    this.windows = {}
    this.windowOrder = []
    this.minimizedWindowOrder = []

    this.dragInfo = {window: null, type: DragType.None}
    this.state = {
      allOrderedWindows: [],
      minimizedWindows: [],
      topWindow: null
    }

    this.attrsRef = this.document.getWindowsDataRef("attrs")
    this.orderRef = this.document.getWindowsDataRef("order")
    this.minimizedOrderRef = this.document.getWindowsDataRef("minimizedOrder")

    // make sure the windows map is populated before checking the ordering
    this.attrsRef.once("value", (snapshot) => {
      this.listenOnlyForTitleAttrChanges = false
      this.handleAttrsRef(snapshot)

      // listen to attrs changes always since we allow title updates when this.synChanges is false
      this.listenOnlyForTitleAttrChanges = !this.syncChanges
      this.attrsRef.on("value", this.handleAttrsRef)

      if (this.syncChanges) {
        this.orderRef.on("value", this.handleOrderRef)
        this.minimizedOrderRef.on("value", this.handleMinimizedOrderRef)
      }
      else {
        // listen to new windows being added
        this.lastAttrsQuery = this.attrsRef.limitToLast(1)
        this.lastAttrsQuery.on("child_added", this.handleAttrsRefChildAdded)

        // listen to windows being removed (for private windows)
        this.attrsRef.on("child_removed", this.handleAttrsRefChildRemoved)

        // just get the initial order
        this.orderRef.once("value", this.handleOrderRef)
        this.minimizedOrderRef.once("value", this.handleMinimizedOrderRef)
      }
    })
  }

  destroy() {
    this.attrsRef.off("value", this.handleAttrsRef)

    if (this.syncChanges) {
      this.orderRef.off("value", this.handleOrderRef)
      this.minimizedOrderRef.off("value", this.handleMinimizedOrderRef)
    }
    else {
      this.lastAttrsQuery.off("child_added", this.handleAttrsRefChildAdded)
    }
  }

  setLogManager(logManager:LogManager) {
    this.logManager = logManager
  }

  notifyStateChange() {
    this.onStateChanged(this.state)
  }

  firebaseOrderMapToArray(orderMap:FirebaseOrderMap) {
    const invertedOrderMap:InvertedFirebaseOrderMap = {}
    Object.keys(orderMap).forEach((windowId) => {
      const order = orderMap[windowId] as number // to avoid TS complaining about possible nulls
      invertedOrderMap[order] = windowId
    })
    const orderArray:string[] = [];
    Object.keys(invertedOrderMap).forEach((key) => {
      orderArray[parseInt(key)] = invertedOrderMap[key]
    })
    return orderArray
  }

  arrayToFirebaseOrderMap(orderArray:string[]) {
    const orderMap:FirebaseOrderMap = {}
    orderArray.forEach((windowId, index) => {
      orderMap[windowId] = index
    })
    return orderMap
  }

  handleAttrsRefChildAdded = (snapshot:firebase.database.DataSnapshot) => {
    const windowId = snapshot.key
    const attrs:FirebaseWindowAttrs|null = snapshot.val()
    if (windowId && !this.windows[windowId] && attrs) {
      const window = new Window(windowId, {
        document: this.document,
        attrs
      })
      this.windows[windowId] = window
      if (this.nonPrivateWindow({window})) {
        this.moveToTop(window)
      }
    }
  }

  handleAttrsRefChildRemoved = (snapshot:firebase.database.DataSnapshot) => {
    const window = snapshot.key ? this.windows[snapshot.key] : null
    if (window) {
      this.close(window)
    }
  }

  handleAttrsRef = (snapshot:firebase.database.DataSnapshot) => {
    const attrsMap:FirebaseWindowAttrsMap|null = snapshot.val()
    const updatedWindows:WindowMap = {}

    if (attrsMap) {
      Object.keys(attrsMap).forEach((id) => {
        const window = this.windows[id]
        const attrs = attrsMap[id]
        if (attrs) {
          if (this.listenOnlyForTitleAttrChanges) {
            if (window) {
              window.setLocalTitle(attrs.title)
            }
          }
          else if (window) {
            window.setAttrs(attrs, false)
            updatedWindows[id] = window
          }
          else {
            updatedWindows[id] = new Window(id, {
              document: this.document,
              attrs
            })
          }
        }
      })
    }

    if (!this.listenOnlyForTitleAttrChanges) {
      this.windows = updatedWindows
    }

    // NOTE: there is no state change notification here on purpose as
    // the window manager state is only concerned with the order of the windows.
    // This does mean that the attrs map needs to be set for a window id before
    // the window id is added to the ordered lists as is done in add() below.
    // The window component will trigger a re-render when its setAttrs() method is called
    // which is much more performant since only that window needs to re-render
  }

  // You may ask yourself "Why not just maintain the list of windows in the state
  // as a plain array?".  The reason it is not done is that React will move the
  // iframe element in the DOM on a re-render which causes the iframe to reload.
  // By keeping the render ordering always the same and using a separate order field
  // to set the zIndex of the window we avoid iframe reloads.
  // You may also ask youself "Why keep the order as a hash in Firebase and an array in the manager?"
  // This is because we don't want to be rewriting entire arrays in Firebase as that doesn't
  // handle writes by simulataneous users.  Instead we keep a map in Firebase so we can use
  // update to set the order and then an array in the manager to simplify the loops of windows
  handleOrderRef = (snapshot:firebase.database.DataSnapshot) => {
    const windowOrderMap:FirebaseOrderMap = snapshot.val() || {}
    const windowOrder = this.firebaseOrderMapToArray(windowOrderMap)
    this.handleOrderChange(windowOrder)
  }

  handleOrderChange = (windowOrder:string[]) => {
    this.windowOrder = windowOrder
    this.state.allOrderedWindows = []
    this.state.topWindow = null

    let topOrder = 0
    this.forEachWindow((window) => {
      const order = windowOrder.indexOf(window.id)
      if (window && (order !== -1)) {
        this.state.allOrderedWindows.push({order, window})
        if (!window.attrs.minimized && this.nonPrivateWindow({window})) {
          if (!this.state.topWindow || (order > topOrder)) {
            this.state.topWindow = window
            topOrder = order
          }
        }
      }
    })

    this.notifyStateChange()
  }

  handleMinimizedOrderRef = (snapshot:firebase.database.DataSnapshot) => {
    const minimizedWindowOrderMap:FirebaseOrderMap = snapshot.val() || {}
    const minimizedWindowOrder = this.firebaseOrderMapToArray(minimizedWindowOrderMap)
    this.handleMinimizedOrderChange(minimizedWindowOrder)
  }

  handleMinimizedOrderChange = (minimizedWindowOrder:string[]) => {
    this.minimizedWindowOrder = minimizedWindowOrder
    this.state.minimizedWindows = []

    minimizedWindowOrder.forEach((id) => {
      const window = this.windows[id]
      if (window) {
        this.state.minimizedWindows.push(window)
      }
    })

    this.notifyStateChange()
  }

  registerDragWindow(window:Window|null, type:DragType=DragType.None) {
    this.dragInfo.window = window
    this.dragInfo.type = type
  }

  updateDragWindow(attrs: FirebaseWindowAttrs) {
    const {window} = this.dragInfo
    if (window) {
      window.setAttrs(attrs, this.syncChanges)
    }
  }

  randInRange(min:number, max:number) {
    return Math.round(min + (Math.random() * (max - min)))
  }

  ensureUniqueTitle(title:string) {
    const isUniqueTitle = (title:string) => {
      let isUnique = true
      this.forEachWindow((window) => {
        if (window.attrs.title === title) {
          isUnique = false
        }
      })
      return isUnique
    }

    if (isUniqueTitle(title)) {
      return title
    }

    let index = 2
    let prefix = title
    const endsWithNumber = / (\d+)$/
    const matches = prefix.match(endsWithNumber)
    if (matches) {
      index = parseInt(matches[1], 10) + 1
      prefix = prefix.replace(endsWithNumber, '')
    }

    let newTitle
    do {
      newTitle = `${prefix} ${index++}`
    } while (!isUniqueTitle(newTitle))

    return newTitle
  }

  add(params:AddWindowParams) {
    //url: string, title:string, ownerId: string, iframeData?:any, dataSet?:FirebaseWindowDataSet) {
    const {url, title, ownerId, iframeData, annotations, dataSet, createNewDataSet} = params
    const attrs:FirebaseWindowAttrs = {
      top: this.randInRange(50, 200),
      left: this.randInRange(50, 200),
      width: 700,
      height: 500,
      minimized: false,
      maximized: false,
      url,
      title: this.ensureUniqueTitle(title)
    }
    if (ownerId) {
      attrs.ownerId = ownerId
    }

    let dataSetCreatorRef:firebase.database.Reference

    if (dataSet) {
      attrs.dataSet = dataSet
    }
    else if (createNewDataSet) {
      // we have a bit of a catch-22, we need the window id as the value of the creator but
      // we don't have that until we create it in Firebase so we just use a TDB value that we ignore
      // in the workspace client (since TDB is not a valid window id)
      dataSetCreatorRef = this.document.getDataSetsDataRef().child(this.document.id).child("creators").push("TDB")
      if (dataSetCreatorRef.key) {
        const newDataSet:FirebaseWindowDataSet = {
          documentId: this.document.id,
          dataSetId: dataSetCreatorRef.key
        }
        attrs.dataSet = newDataSet
      }
    }
    Window.CreateInFirebase({document: this.document, attrs}, iframeData, annotations)
      .then((window) => {
        if (createNewDataSet && dataSetCreatorRef) {
          dataSetCreatorRef.set(window.id)
        }
        this.moveToTop(window, true)
        if (this.logManager && params.log) {
          const logParams = assign({}, {creator: this.logManager.userId(), private: !!ownerId}, params.log.params)
          this.logManager.logEvent(params.log.name, window.id, logParams)
        }
      })
      .catch((err) => {})
  }

  moveToTop(window:Window, forceSync:boolean = false) {
    const moveToTopInOrder = (order:string[]) => {
      const index = order.indexOf(window.id)
      if (index !== -1) {
        order.splice(index, 1)
      }
      order.push(window.id)
    }

    if (this.syncChanges || forceSync) {
      this.orderRef.once("value", (snapshot) => {
        const currentOrderMap:FirebaseOrderMap = snapshot.val() || {}
        const order = this.firebaseOrderMapToArray(currentOrderMap)
        moveToTopInOrder(order)
        const newOrderMap = this.arrayToFirebaseOrderMap(order)
        this.orderRef.update(newOrderMap)
      })
    }
    else {
      moveToTopInOrder(this.windowOrder)
      this.handleOrderChange(this.windowOrder)
    }
  }

  close(window:Window) {
    const afterRemoving = () => {
      window.close()
      delete this.windows[window.id]
    }

    if (this.syncChanges) {
      const orderMap:FirebaseOrderMap = {}
      orderMap[window.id] = null
      this.orderRef.update(orderMap, afterRemoving)
    }
    else {
      const index = this.windowOrder.indexOf(window.id)
      if (index !== -1) {
        this.windowOrder.splice(index, 1)
      }
      this.handleOrderChange(this.windowOrder)
      afterRemoving()
    }
  }

  restoreMinimized(window:Window) {
    this.setState(window, false, window.attrs.maximized)
    this.moveToTop(window)
  }

  setState(window:Window, minimized: boolean, maximized: boolean) {
    const {attrs} = window
    attrs.maximized = maximized
    attrs.minimized = minimized
    window.setAttrs(attrs, this.syncChanges)

    if (this.syncChanges) {
      if (!minimized) {
        const updateToMinimizedOrderMap:FirebaseOrderMap = {}
        updateToMinimizedOrderMap[window.id] = null
        this.minimizedOrderRef.update(updateToMinimizedOrderMap)
      }
      else {
        this.minimizedOrderRef.once("value", (snapshot) => {
          const currentMinimizedOrderMap:FirebaseOrderMap = snapshot.val() || {}
          const minimizedOrderArray = this.firebaseOrderMapToArray(currentMinimizedOrderMap)
          const index = minimizedOrderArray.indexOf(window.id)
          if (index === -1) {
            minimizedOrderArray.push(window.id)
            const newMinimizedOrderMap = this.arrayToFirebaseOrderMap(minimizedOrderArray)
            this.minimizedOrderRef.update(newMinimizedOrderMap)
          }
        })
      }
    }
    else {
      const index = this.minimizedWindowOrder.indexOf(window.id)
      if (!minimized && (index !== -1)) {
        this.minimizedWindowOrder.splice(index, 1)
      }
      else if (minimized && (index === -1)) {
        this.minimizedWindowOrder.push(window.id)
      }
      this.handleMinimizedOrderChange(this.minimizedWindowOrder)
    }
  }

  changeTitle(window:Window, newTitle:string) {
    const {attrs} = window
    attrs.title = newTitle
    window.setAttrs(attrs, true)
  }

  windowLoaded(window:Window, element:HTMLIFrameElement, callback: () => void) {
    window.iframe = {
      window: window,
      element,
      connected: false,
      inited: false,
      dataRef: this.document.getWindowsDataRef("iframeData").child(window.id),
      phone: IFramePhoneFactory.ParentEndpoint(element, () => {
        window.iframe.connected = true
        const initRequest:WorkspaceClientInitRequest = {
          type: "collabspace",
          version: "1.0.0",
          id: window.id,
          documentId: this.document.id,
          readonly: this.document.isReadonly,
          firebase: {
            config: FirebaseConfig,
            dataPath: getRelativeRefPath(window.iframe.dataRef),
            dataSet: window.attrs.dataSet,
            dataSetsPath: getRelativeRefPath(this.document.getDataSetsDataRef()),
            attrsPath: getRelativeRefPath(this.document.getWindowsDataRef("attrs"))
          },
          tokens: this.tokens
        }
        window.iframe.phone.addListener(WorkspaceClientInitResponseMessage, (resp:WorkspaceClientInitResponse) => {
          window.iframe.inited = true
          callback()
        })
        window.iframe.phone.post(WorkspaceClientInitRequestMessage, initRequest)
      })
    }
  }

  getWindow(windowId:string) {
    return this.windows[windowId]
  }

  postToWindow(window:Window, message:string, request:object) {
    if (window.iframe && window.iframe.connected) {
      window.iframe.phone.post(message, request)
    }
  }

  postToWindowIds(windowIds:string[], message:string, request:object) {
    windowIds.forEach((windowId) => {
      const window = this.windows[windowId]
      if (window) {
        this.postToWindow(window, message, request)
      }
    })
  }

  postToAllWindows(message:string, request:object) {
    this.forEachWindow((window) => {
      this.postToWindow(window, message, request)
    })
  }

  forEachWindow(callback: (window:Window) => void) {
    Object.keys(this.windows).forEach((id) => {
      const window = this.windows[id]
      if (window) {
        callback(window)
      }
    })
  }

  copyWindow(window: Window, title: string, ownerId?: string) {
    return new Promise<void>((resolve, reject) => {
      const windowsRef = this.document.getWindowsRef()
      windowsRef.once("value")
        .then((snapshot) => {
          const windows:FirebaseWindows|null = snapshot.val()
          const firebaseWindow = windows && windows.attrs[window.id]
          const iframeData = windows && windows.iframeData && windows.iframeData[window.id] ? windows.iframeData[window.id] : undefined
          const annotations = windows && windows.annotations && windows.annotations[window.id] ? windows.annotations[window.id] : undefined
          if (!firebaseWindow) {
            return reject("Cannot find window in document")
          }
          const {dataSet, url} = firebaseWindow
          const logParams: AddWindowLogParams = {
            name: "Copied window",
            params: {
              copiedFrom: window.id
            }
          }
          const addWindowParams:AddWindowParams = {url, title, iframeData, annotations, dataSet, log: logParams}
          if (ownerId) {
            addWindowParams.ownerId = ownerId
          }
          this.add(addWindowParams)
          resolve()
        })
        .catch(reject)
    })
  }

  copyWindowFromPublication(portalOffering: PortalOffering, options: PublicationWindowOptions, title:string, ownerId?:string) {
    return new Promise<void>((resolve, reject) => {
      const {windowId} = options
      // open the publication document
      const documentDataRef = getDocumentRef(portalOffering, this.document.id).child("data")
      // TODO:
      let publicationDataRef:firebase.database.Reference
      if (options.type === "offering") {
        publicationDataRef = getDocumentRef(options.offering, options.documentId).child("data")
      }
      else {
        publicationDataRef = getDocumentRefByClass(portalOffering.domain, options.classHash, options.documentId).child("data")
      }
      const documentWindowsRef = publicationDataRef.child("windows")
      documentWindowsRef.once("value")
        .then((snapshot) => {
          const windows:FirebaseWindows|null = snapshot.val()
          const attrs = windows && windows.attrs && windows.attrs[windowId] ? windows.attrs[windowId] : null
          const iframeData = windows && windows.iframeData && windows.iframeData[windowId] ? windows.iframeData[windowId] : undefined
          const annotations = windows && windows.annotations && windows.annotations[windowId] ? windows.annotations[windowId] : undefined

          if (!attrs) {
            return reject("Cannot find window in publication!")
          }
          else {
            const {dataSet, url} = attrs
            const done = () => {
              const logParams: AddWindowLogParams = {
                name: "Copied window from publication",
                params: {
                  copiedFrom: windowId
                }
              }
              this.add({url, title, iframeData, annotations, dataSet, log: logParams, ownerId})
              resolve()
            }
            if (dataSet) {
              // copy datasets from publication into document if it doesn't already exist
              const existingRef = documentDataRef.child("datasets").child(dataSet.documentId)
              existingRef.once("value", (snapshot) => {
                const val = snapshot.val()
                if (!val) {
                  const copyRef = publicationDataRef.child("datasets").child(dataSet.documentId)
                  copyRef.once("value", (snapshot) => {
                    existingRef.set(snapshot.val())
                    done()
                  })
                }
                else {
                  done()
                }
              })
            }
            else {
              done()
            }
          }
        })
        .catch(reject)
    })
  }

  snapshotWindow(window: Window, snapshotPath: string, annotationImageDataUrl: string|null) {
    return new Promise<string>((resolve, reject) => {
      if (!window.iframe.inited) {
        return reject("Window does not respond to snapshot requests")
      }

      const responseTimeout = setTimeout(() => {
        reject("Window did not respond to snapshot request")
      }, 5000)

      const {phone} = window.iframe
      const handleSnapshotResponse = (response: WorkspaceClientSnapshotResponse) => {
        clearTimeout(responseTimeout)
        resolve(response.snapshotUrl)
        phone.removeListener(WorkspaceClientSnapshotResponseMessage)
      }

      phone.addListener(WorkspaceClientSnapshotResponseMessage, handleSnapshotResponse)

      const request:WorkspaceClientSnapshotRequest = {snapshotPath, annotationImageDataUrl}
      phone.post(WorkspaceClientSnapshotRequestMessage, request)
    })
  }
}