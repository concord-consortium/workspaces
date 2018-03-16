export interface RenameAttributeEvent {
  type: 'rename-attribute';
  id: string;
  name: string;
}

export interface AddAttributeEvent {
  type: 'add-attribute';
}

export type CaseTableEvent = RenameAttributeEvent | AddAttributeEvent;

export type Listener = (event: CaseTableEvent) => void;

const listeners: Listener[] = [];

export const emitCaseTableEvent = (event: CaseTableEvent) => {
  listeners.forEach((listener) => listener(event));
};

export const listenForCaseTableEvents = (listener: Listener) => {
  listeners.push(listener);
};
