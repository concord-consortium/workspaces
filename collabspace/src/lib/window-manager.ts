import { Window, WindowMap, IFrame, FirebaseWindowAttrs } from "./window"
import { Document, FirebasePublication } from "./document"
import { FirebaseWindowAttrsMap, FirebaseWindows } from "./window"
import { FirebaseConfig } from "./firebase-config"
import { IFramePhoneLib,
  IFramePhoneParent,
  MessageContent,
  MessageType,
  Listener,
  CollabSpaceClientInitRequestMessage,
  CollabSpaceClientInitResponseMessage,
  CollabSpaceClientInitRequest,
  CollabSpaceClientInitResponse
 } from "./collabspace-client"

 const IFramePhoneFactory:IFramePhoneLib = require("iframe-phone")

import * as firebase from "firebase"
import { PortalActivity } from "./auth";
import { getDocumentRef } from "./refs"

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
}

interface FirebaseOrderMap {
  [key: string]: number|null
}
interface InvertedFirebaseOrderMap {
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

  constructor (settings: WindowManagerSettings) {
    this.document = settings.document
    this.onStateChanged = settings.onStateChanged
    this.syncChanges = settings.syncChanges

    this.windows = {}
    this.windowOrder = []
    this.minimizedWindowOrder = []

    this.dragInfo = {window: null, type: DragType.None}
    this.state = {
      allOrderedWindows: [],
      minimizedWindows: [],
      topWindow: null
    }

    this.handleAttrsRef = this.handleAttrsRef.bind(this)
    this.handleAttrsRefChildAdded = this.handleAttrsRefChildAdded.bind(this)
    this.handleOrderRef = this.handleOrderRef.bind(this)
    this.handleOrderChange = this.handleOrderChange.bind(this)
    this.handleMinimizedOrderRef = this.handleMinimizedOrderRef.bind(this)
    this.handleMinimizedOrderChange = this.handleMinimizedOrderChange.bind(this)

    this.attrsRef = this.document.getWindowsDataRef("attrs")
    this.orderRef = this.document.getWindowsDataRef("order")
    this.minimizedOrderRef = this.document.getWindowsDataRef("minimizedOrder")

    // make sure the windows map is populated before checking the ordering
    this.attrsRef.once("value", (snapshot) => {
      this.handleAttrsRef(snapshot)

      if (this.syncChanges) {
        this.attrsRef.on("value", this.handleAttrsRef)
        this.orderRef.on("value", this.handleOrderRef)
        this.minimizedOrderRef.on("value", this.handleMinimizedOrderRef)
      }
      else {
        // listen to new windows being added
        this.lastAttrsQuery = this.attrsRef.limitToLast(1)
        this.lastAttrsQuery.on("child_added", this.handleAttrsRefChildAdded)

        // just get the initial order
        this.orderRef.once("value", this.handleOrderRef)
        this.minimizedOrderRef.once("value", this.handleMinimizedOrderRef)
      }
    })
  }

  destroy() {
    if (this.syncChanges) {
      this.attrsRef.off("value", this.handleAttrsRef)
      this.orderRef.off("value", this.handleOrderRef)
      this.minimizedOrderRef.off("value", this.handleMinimizedOrderRef)
    }
    else {
      this.lastAttrsQuery.off("child_added", this.handleAttrsRefChildAdded)
    }
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

  handleAttrsRefChildAdded(snapshot:firebase.database.DataSnapshot) {
    const windowId = snapshot.key
    const attrs:FirebaseWindowAttrs|null = snapshot.val()
    if (windowId && !this.windows[windowId] && attrs) {
      const window = new Window(windowId, {
        document: this.document,
        attrs
      })
      this.windows[windowId] = window
      this.moveToTop(window)
    }
  }

  handleAttrsRef(snapshot:firebase.database.DataSnapshot) {
    const attrsMap:FirebaseWindowAttrsMap|null = snapshot.val()
    const updatedWindows:WindowMap = {}

    if (attrsMap) {
      Object.keys(attrsMap).forEach((id) => {
        const window = this.windows[id]
        const attrs = attrsMap[id]
        if (attrs) {
          if (window) {
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

    this.windows = updatedWindows

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
  handleOrderRef(snapshot:firebase.database.DataSnapshot) {
    const windowOrderMap:FirebaseOrderMap = snapshot.val() || {}
    const windowOrder = this.firebaseOrderMapToArray(windowOrderMap)
    this.handleOrderChange(windowOrder)
  }

  handleOrderChange(windowOrder:string[]) {
    this.windowOrder = windowOrder
    this.state.allOrderedWindows = []
    this.state.topWindow = null

    let topOrder = 0
    this.forEachWindow((window) => {
      const order = windowOrder.indexOf(window.id)
      if (window && (order !== -1)) {
        this.state.allOrderedWindows.push({order, window})
        if (!window.attrs.minimized) {
          if (!this.state.topWindow || (order > topOrder)) {
            this.state.topWindow = window
            topOrder = order
          }
        }
      }
    })

    this.notifyStateChange()
  }

  handleMinimizedOrderRef(snapshot:firebase.database.DataSnapshot) {
    const minimizedWindowOrderMap:FirebaseOrderMap = snapshot.val() || {}
    const minimizedWindowOrder = this.firebaseOrderMapToArray(minimizedWindowOrderMap)
    this.handleMinimizedOrderChange(minimizedWindowOrder)
  }

  handleMinimizedOrderChange(minimizedWindowOrder:string[]) {
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

  add(url: string, title:string, iframeData?:any) {
    const attrs = {
      top: this.randInRange(50, 200),
      left: this.randInRange(50, 200),
      width: 400,
      height: 400,
      minimized: false,
      maximized: false,
      url,
      title: this.ensureUniqueTitle(title),
    }
    Window.CreateInFirebase({document: this.document, attrs}, iframeData)
      .then((window) => {
        this.moveToTop(window, true)
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
    window.setAttrs(attrs, this.syncChanges)
  }

  windowLoaded(window:Window, element:HTMLIFrameElement) {
    window.iframe = {
      window: window,
      element,
      connected: false,
      dataRef: this.document.getWindowsDataRef("iframeData").child(window.id),
      phone: IFramePhoneFactory.ParentEndpoint(element, () => {
        window.iframe.connected = true
        const initRequest:CollabSpaceClientInitRequest = {
          version: "1.0.0",
          id: window.id,
          readonly: this.document.isReadonly,
          firebase: {
            config: FirebaseConfig,
            dataPath: window.iframe.dataRef.toString().substring(window.iframe.dataRef.root.toString().length)
          }
        }
        window.iframe.phone.addListener(CollabSpaceClientInitResponseMessage, (resp:CollabSpaceClientInitResponse) => {
          // TODO
        })
        window.iframe.phone.post(CollabSpaceClientInitRequestMessage, initRequest)
      })
    }
  }

  postToAllWindows(message:string, request:object) {
    this.forEachWindow((window) => {
      if (window.iframe.connected) {
        window.iframe.phone.post(message, request)
      }
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

  copyWindowFromPublication(portalActivity:PortalActivity, publication:FirebasePublication, windowId: string, title:string) {
    return new Promise<void>((resolve, reject) => {
      // open the publication document
      const documentWindowsRef = getDocumentRef(portalActivity, publication.documentId).child("data").child("windows")
      documentWindowsRef.once("value")
        .then((snapshot) => {
          const windows:FirebaseWindows|null = snapshot.val()
          const attrs = windows && windows.attrs && windows.attrs[windowId] ? windows.attrs[windowId] : null
          const iframeData = windows && windows.iframeData && windows.iframeData[windowId] ? windows.iframeData[windowId] : null

          if (!attrs || !iframeData) {
            return reject("Cannot find window in publication!")
          }
          else {
            this.add(attrs.url, title, iframeData)
          }
        })
        .catch(reject)
    })
  }
}