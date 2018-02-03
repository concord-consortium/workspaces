import * as React from "react"
import * as firebase from "firebase"
import { DrawingMode } from "./drawing-view"
import { EventEmitter, Events } from "../lib/events"

export const TOOLBAR_WIDTH = 48

export const BLACK = "#000"
export const RED = "#f00"
export const BLUE = "#00f"
export const GREEN = "#006400"

export interface ToolbarViewProps {
  mode: DrawingMode
  events: EventEmitter
}

export type ToolbarModalButton = "edit" | "drawBlackLine" | "drawRedLine" | "drawBlueLine" | "drawGreenLine" | "coin" | "pouch" | "select"

const coinImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAAZCAYAAADE6YVjAAAFZmlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iWE1QIENvcmUgNS41LjAiPgogPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIgogICAgeG1sbnM6YXV4PSJodHRwOi8vbnMuYWRvYmUuY29tL2V4aWYvMS4wL2F1eC8iCiAgICB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iCiAgICB4bWxuczpleGlmRVg9Imh0dHA6Ly9jaXBhLmpwL2V4aWYvMS4wLyIKICAgIHhtbG5zOnBob3Rvc2hvcD0iaHR0cDovL25zLmFkb2JlLmNvbS9waG90b3Nob3AvMS4wLyIKICAgIHhtbG5zOnRpZmY9Imh0dHA6Ly9ucy5hZG9iZS5jb20vdGlmZi8xLjAvIgogICAgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIgogICBhdXg6TGVucz0iIgogICBleGlmRVg6TGVuc01vZGVsPSIiCiAgIHBob3Rvc2hvcDpTb3VyY2U9Imh0dHBzOi8vb3BlbmNsaXBhcnQub3JnL2RldGFpbC8xNzM5ODQvcHJldHR5LWNvaW4tZ29sZGVuLWJ5LXF1Ym9kdXAtMTczOTg0IgogICB0aWZmOkltYWdlTGVuZ3RoPSIxMDAiCiAgIHRpZmY6SW1hZ2VXaWR0aD0iMTAwIgogICB4bXA6Q3JlYXRvclRvb2w9Ind3dy5pbmtzY2FwZS5vcmciPgogICA8ZGM6Y3JlYXRvcj4KICAgIDxyZGY6U2VxPgogICAgIDxyZGY6bGk+cXVib2R1cDwvcmRmOmxpPgogICAgPC9yZGY6U2VxPgogICA8L2RjOmNyZWF0b3I+CiAgIDxkYzpkZXNjcmlwdGlvbj4KICAgIDxyZGY6QWx0PgogICAgIDxyZGY6bGkgeG1sOmxhbmc9IngtZGVmYXVsdCI+SnVzdCBhIHNpbXBsZSByZW1peCBvZiBhIFBoaWxpcHBpbmUgY29pbiwgd2l0aG91dCB0ZXh0LjwvcmRmOmxpPgogICAgPC9yZGY6QWx0PgogICA8L2RjOmRlc2NyaXB0aW9uPgogICA8ZGM6cmlnaHRzPgogICAgPHJkZjpBbHQ+CiAgICAgPHJkZjpsaSB4bWw6bGFuZz0ieC1kZWZhdWx0Ij5DQzAgUHVibGljIERvbWFpbiBEZWRpY2F0aW9uIGh0dHA6Ly9jcmVhdGl2ZWNvbW1vbnMub3JnL3B1YmxpY2RvbWFpbi96ZXJvLzEuMC88L3JkZjpsaT4KICAgIDwvcmRmOkFsdD4KICAgPC9kYzpyaWdodHM+CiAgIDxkYzp0aXRsZT4KICAgIDxyZGY6QWx0PgogICAgIDxyZGY6bGkgeG1sOmxhbmc9IngtZGVmYXVsdCI+UHJldHR5IENvaW4sIEdvbGRlbjwvcmRmOmxpPgogICAgPC9yZGY6QWx0PgogICA8L2RjOnRpdGxlPgogIDwvcmRmOkRlc2NyaXB0aW9uPgogPC9yZGY6UkRGPgo8L3g6eG1wbWV0YT4KPD94cGFja2V0IGVuZD0iciI/PqIKCUMAAAGBaUNDUHNSR0IgSUVDNjE5NjYtMi4xAAAokXWR3yuDURjHP9usiWmKCxculsbVJqaGG2VLoyTNlOFme+2H2o+3950kt8rtihI3fl3wF3CrXCtFpKTcuSZu0Ot5N7Ule07PeT7ne87zdM5zwBrNKjm9oQ9y+aIWCQfdc7F5t+MZO05c2BiMK7o6Oj09SV37uMNixhufWav+uX+teSmpK2BpFB5RVK0oPC48uVpUTd4Wblcy8SXhU2GvJhcUvjX1RIVfTE5X+MtkLRoJgbVV2J2u4UQNKxktJywvx5PLrii/9zFf4kzmZ2ckdol3ohMhTBA3E4wRIkA/wzIH8OGnV1bUye8r509RkFxFZpU1NJZJk6GIV9QVqZ6UmBI9KSPLmtn/v33VUwP+SnVnEOxPhvHWDY4t+C4ZxuehYXwfge0RLvLV/MIBDL2LXqpqnn1wbcDZZVVL7MD5JnQ8qHEtXpZs4tZUCl5PoCUGbdfQtFDp2e8+x/cQXZevuoLdPeiR867FHzJrZ87J10dMAAAACXBIWXMAAAQAAAAEAAEZI5prAAAGbElEQVRIiY2WW4yVVxmGn7XWf9j73/8+zJ49e/YwHGY4WgN0QKC2IgkJaYlpGsRIjDGmvbRemXjRRCPhxmsv9MY0wq0xsSSiNrZkFDDSEpwpisVkOA0ws2f2Yfbh34f/uLwYaOCi2PdqJWvle5Mv63ufT/B/VL9QrKjci8eVu6silVvRgECTxL1q4t2qRp0b75deb1afV0N83kXj4v4Zs3j4dDj0TvRaywTde7j5LIZpkcQRXrtFKjdFOj+BsnLnw8alM6PH5ua/sEn76qmzwiq+GXTuEvQbxEEb263Qrd8nGHrkCw5Wbit+r4qdzqHsUaQzDeHaufxXf/vWc02afyoUVPnkrNdYnDFUzNrSv1BKksmO0Go2cFIRjgNCSIQQBIzhtZoYRkJufC+JltjZzfN+7fdHy99otZ7UNZ42MconZxsPb84QLSOcArYVkbbBcvKUnA1IGSFFjJAGCBPZ75LPryAAHa7S7w7w+52Z7PjJWfjNvid15dMt6tQXZ4iqZEtbMZOH5EobsUYPIN3NqOQRSpk4234MwiAePCBd2IKV/wpGeiMiWMId2UQ8XCUZLM60/nHq7DPtalzcP2MWDs0N27eQSRM9fIhI7UAwRIdN3D2/giQiHlZJIg9puKj0BEIoOjfeRlklUBZxbwFhb0BaZVRmB1Hr432jx+bmDQCzePh01P0v9G8AApWaRNh5rLFvIcwCfm0Wv/FXRBIiZQYhIpK4h1U+TmbnzyBqMax9iLQ3oP1lEr8K0sIc/fppmPumrF8oVnTknQgHdaQwAYGwxkmCOob7JYLGVYLG3wnCDHb5NZztP0LlZgj0OGHzY4K1j5DuLhK/jrTH0QBCkgQNdNQ9sXqhUDFU7sXjib9EOGhjZMYQRgYdd7HHXmWwOsuw+h5BIDAMRTzciugvEocdUtkKzfuXSbdvIc0cVvkYUeNvSGcb8bCFjD0Sv4qRf+mwVO6uSuTdR6Y3EPvLCJXBGnsVo/gyYe0PDAYmgdyJKp/CHjtCkoCz8dtkNn+PysGfo/KvEKz+EWvka5il1xDKJRw20GqcuHcXld6y3RAqU9EqR6u6SCmfoHWEX7sI1gTSGmNk6xGETAGasDWP1pqhv4hAo4FUfgtJzycePsKvfYCUJr2+pu3doTQxgTCzFQMkQWxC3AEBOokwCwcg9jALh0A563Pw+DPKx+d1E41AINwvoyMPs3CQqHWdXFZTq/cIIoM0EgMSZBKAckF3EdLEyO9DxwMQFnHnE/y1q3TakB+rYOX2Ulv8N763TH7Ewh3bg5HfjzBcjPw+os48QghM28EyQrROkDryqlHQxclvIU4UAoV366dIuwzCxJ78DqYzjZQg7F2kN30XZ3QnSmmszCTpTd8HJNIq4936CUIaCAGlyWkkXUi8qoz79xakswXfW8LMjKNjD2UWIAlAGoDC2fEOxU0HEP6n9O/9GhXcZHzbSxReeAetAWGgdYCyiujII5EliOoY6Sni3p0FGbavXXGyE2SLOXRQI+7fRtgbCdufYGZfIGxdR8c+ztTbWCOH0GETp/wKmekfkMRDwtbc+rv2PDI1ie7fxuusIVQGYVcI165fMcqvN6uduez5VFQ+EbcXEUDiPyKoVYk6czjTPyRo/ROSEFU4hHR3Iw2HoPnRejvHjtC780sIVtE6Jow0/lCDUUSo7PnyG82qBAgal88oZwrl7kGbG4n7y0hpg44JO58CCmvkAFJIhFiPemvkAAhJ2PkP6AQhbeLBEt1gksLEbgxniqB5+cxnKVw6Njevw7VzSINhv43M7mXQWkD7K4T1DwgevMtw5X3isEPQuEQcdhiu/JnO7XcZrHyIDlaIeguo7F6k9lCGIon7vyg9JuUz0Gpfe2su6t6cCbwqZroI/oP1+UhtQ1kuOokQRCAMEAZex6Nbu00uq0nnNtDtDDCdEdzS7vnCoXOf8eQZaPm1947aYydnpZGbSZIE7T9cp2DSJe7cAZKnkCoxKCGlouvFpIolMkWF5W6aD+rnj34ufp+odfXUWWEW34y8e/S7DWK/jTtSAX+RQa+DnXIxslOPIz2LtEZRma0kQePcyMu/ez7jn1b9L/tmrNLh06HfPTHoLBF0F3HcLKZtg44gbqPSU0i7gjay58PGpTOlY/NffFt5WtULhYqZPXjYcKe3C5WpCKEAjY671di7uxC2rl0pv9F67t71P9Jn6EsSyRk7AAAAAElFTkSuQmCC"
const pouchImage = "data:image/png;base64,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"

export interface ToolbarViewState {
  selectedButton: ToolbarModalButton
}

export class ToolbarView extends React.Component<ToolbarViewProps, ToolbarViewState> {
  constructor(props:ToolbarViewProps){
    super(props)

    this.state = {
      selectedButton: "edit"
    }

    this.addEventListeners()
  }

  addEventListeners() {
    this.props.events.listen(Events.EditModeSelected, () => this.setState({selectedButton: "edit"}))
    this.props.events.listen(Events.LineDrawingToolSelected, (data) => {
      switch (data.color) {
        case BLACK:
          this.setState({selectedButton: "drawBlackLine"})
          break
        case RED:
          this.setState({selectedButton: "drawRedLine"})
          break
        case BLUE:
          this.setState({selectedButton: "drawBlueLine"})
          break
        case GREEN:
          this.setState({selectedButton: "drawGreenLine"})
          break
      }
    })
    this.props.events.listen(Events.SelectionToolSelected, () => this.setState({selectedButton: "select"}))
    this.props.events.listen(Events.CoinToolSelected, () => this.setState({selectedButton: "coin"}))
    this.props.events.listen(Events.PouchToolSelected, () => this.setState({selectedButton: "pouch"}))
  }

  handleEditModeButton = () => this.props.events.emit(Events.EditModeSelected)
  handleLineDrawingToolButton = (color:string) => () => this.props.events.emit(Events.LineDrawingToolSelected, {color: color})
  handleSelectionToolButton = () => this.props.events.emit(Events.SelectionToolSelected)
  handleCoinToolButton = () => this.props.events.emit(Events.CoinToolSelected, {image: coinImage})
  handlePouchToolButton = () => this.props.events.emit(Events.PouchToolSelected, {image: pouchImage})
  handleUndoButton = () => this.props.events.emit(Events.UndoPressed)
  handleRedoButton = () => this.props.events.emit(Events.RedoPressed)
  handleDeleteButton = () => this.props.events.emit(Events.DeletePressed)

  modalButtonClass(type:ToolbarModalButton) {
    return `button ${type === this.state.selectedButton ? "selected" : ""}`
  }

  render() {
    return (
      <div className="toolbar" style={{width: TOOLBAR_WIDTH}}>
        <div className="buttons">
          <div className={this.modalButtonClass("edit")} title="Edit Mode" onClick={this.handleEditModeButton}>A</div>
          <div className={this.modalButtonClass("drawBlackLine")} title="Black Line Drawing Mode" onClick={this.handleLineDrawingToolButton(BLACK)} style={{color: BLACK}}>🖉</div>
          <div className={this.modalButtonClass("drawRedLine")} title="Red Line Drawing Mode" onClick={this.handleLineDrawingToolButton(RED)} style={{color: RED}}>🖉</div>
          <div className={this.modalButtonClass("drawBlueLine")} title="Blue Line Drawing Mode" onClick={this.handleLineDrawingToolButton(BLUE)} style={{color: BLUE}}>🖉</div>
          <div className={this.modalButtonClass("drawGreenLine")} title="Green Line Drawing Mode" onClick={this.handleLineDrawingToolButton(GREEN)} style={{color: GREEN}}>🖉</div>
          <div className={this.modalButtonClass("coin")} title="Coin" onClick={this.handleCoinToolButton}><img src={coinImage} /></div>
          <div className={this.modalButtonClass("pouch")} title="Pouch" onClick={this.handlePouchToolButton}><img src={pouchImage} /></div>
          <div className={this.modalButtonClass("select")} title="Select" onClick={this.handleSelectionToolButton}>⬚</div>
          <div className="button" title="Undo" onClick={this.handleUndoButton}>↶</div>
          <div className="button" title="Redo" onClick={this.handleRedoButton}>↷</div>
          <div className="button" title="Delete" onClick={this.handleDeleteButton}>🗑</div>
        </div>
      </div>
    )
  }
}