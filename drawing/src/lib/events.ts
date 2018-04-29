export enum Events {
  TextToolSelected,
  LineDrawingToolSelected,
  VectorToolSelected,
  SelectionToolSelected,
  ImageToolSelected,
  RectangleToolSelected,
  EllipseToolSelected,
  SettingsToolSelected,
  UndoPressed,
  RedoPressed,
  DeletePressed,
  SettingsChanged,
  ObjectsSelected
}

export type EventEmitterCallback = (data?:any) => void
export interface EventEmitterCallbackMap {
  [key: number]: EventEmitterCallback[]|null
}

export class EventEmitter {
  listeners: EventEmitterCallbackMap

  constructor() {
    this.listeners = {}
  }

  listen(event:number, listener:EventEmitterCallback) {
    let queue = this.listeners[event]
    if (!queue) {
      queue = this.listeners[event] = [];
    }
    queue.push(listener)
  }

  emit(event: number, data?:any) {
    let queue = this.listeners[event]
    if (queue) {
      queue.forEach((listener) => {
        listener(data)
      })
    }
  }
}