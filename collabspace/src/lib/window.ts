import { Document } from "./document"
import { IFramePhoneParent } from "../../../shared/workspace-client"
import { FirebaseOrderMap } from "./window-manager"
import * as firebase from "firebase"

export interface FirebaseAnnotationWindowMap {
  [key: string]: FirebaseAnnotationMap
}

export interface FirebaseAnnotationMap {
  [key: string]: Annotation
}

export type Annotation = PathAnnotation

export interface PathAnnotationPoint {
  x: number
  y: number
}

export interface PathAnnotation {
  type: "path"
  id: string
  userId: string|null
  points: PathAnnotationPoint[]
}

export interface FirebaseWindowDataSet {
  documentId: string
  dataSetId: string
}
export interface FirebaseWindowAttrs {
  top: number
  left: number
  width: number
  height: number
  url: string
  title: string
  // two booleans are used instead of a single state so that we remember if the window should
  // restore to maximized after being minimized
  minimized: boolean
  maximized: boolean
  dataSet?: FirebaseWindowDataSet
  ownerId?: string|null
}

export interface FirebaseWindowAttrsMap {
  [key: string]: FirebaseWindowAttrs|null
}

export interface FirebaseIFrameDataMap {
  [key: string]: any|null
}

export interface FirebaseAnnotationsMap {
  [key: string]: any|null
}

export interface FirebaseWindows {
  attrs: FirebaseWindowAttrsMap
  order: FirebaseOrderMap
  minimizedOrder: FirebaseOrderMap
  iframeData: FirebaseIFrameDataMap
  annotations: FirebaseAnnotationWindowMap
}

export interface WindowMap {
  [key: string]: Window|null
}

export interface IFrame {
  window: Window
  element: HTMLIFrameElement
  connected: boolean
  inited: boolean
  phone: IFramePhoneParent
  dataRef: firebase.database.Reference
}

export interface IFrameMap {
  [key: string]: IFrame|null
}

export interface WindowOptions {
  document: Document
  attrs: FirebaseWindowAttrs
}

export class Window {
  document: Document
  attrs: FirebaseWindowAttrs
  onAttrsChanged: ((newAttrs:FirebaseWindowAttrs) => void)|null

  id: string
  iframe: IFrame
  attrsRef: firebase.database.Reference

  constructor(id: string, options:WindowOptions) {
    this.id = id
    this.document = options.document
    this.attrs = options.attrs

    this.attrsRef = this.document.getWindowsDataRef("attrs").child(id)
    this.onAttrsChanged = null
  }

  destroy() {
  }

  static CreateInFirebase(options: WindowOptions, iframeData?:any, annotations?:any): Promise<Window> {
    return new Promise<Window>((resolve, reject) => {
      let windowId
      const attrsRef = options.document.getWindowsDataRef("attrs")
      if (iframeData || annotations) {
        if (iframeData) {
          const iframeRef = options.document.getWindowsDataRef("iframeData")
          const iframeDataRef = iframeRef.push(iframeData)
          if (iframeDataRef.key) {
            attrsRef.child(iframeDataRef.key).set(options.attrs)
            windowId = iframeDataRef.key
          }
        }
        if (annotations) {
          const annotationsRef = options.document.getWindowsDataRef("annotations")
          if (windowId) {
            annotationsRef.child(windowId).set(annotations)
          }
          else {
            const annotationsDataRef = annotationsRef.push(annotations)
            if (annotationsDataRef.key) {
              windowId = annotationsDataRef.key
            }
          }
        }
      }
      else {
        const attrsDataRef = attrsRef.push(options.attrs)
        windowId = attrsDataRef.key
      }
      if (windowId) {
        resolve(new Window(windowId, options))
      }
    })
  }

  close() {
    this.destroy()
    if (!this.document.isReadonly) {
      this.iframe.dataRef.set(null)
      this.attrsRef.set(null)
    }
  }

  setAttrs(attrs:FirebaseWindowAttrs, updateFirebase:boolean = true) {
    this.attrs = attrs
    if (updateFirebase && !this.document.isReadonly) {
      this.attrsRef.set(attrs)
    }
    if (this.onAttrsChanged) {
      this.onAttrsChanged(attrs)
    }
  }

  setLocalTitle(title: string) {
    this.attrs.title = title
    if (this.onAttrsChanged) {
      this.onAttrsChanged(this.attrs)
    }
  }


}
