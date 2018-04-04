import * as React from "react"
import * as firebase from "firebase"
import { PortalOffering } from "../lib/auth"
import { getUploadsStoragePath } from "../lib/refs"
import { v4 as uuidV4 } from "uuid"

const demoInfo = require("../../functions/demo-info").demoInfo;

export interface UploadImageDialogComponentProps {
  offering: PortalOffering|null
  onAddUploadedImage: (title: string, imageUrl:string, isPrivate:boolean) => void
  onCancelUploadedImage: () => void
  enableVisibilityOptions: boolean
}

export interface UploadImageDialogComponentState {
  name: string
  imageUploadUrl: string|null
  imageDataUrl: string|null
  uploading: boolean
  uploaded: boolean
  progress: number
}

export class UploadImageDialogComponent extends React.Component<UploadImageDialogComponentProps, UploadImageDialogComponentState> {
  infoRef: firebase.database.Reference

  constructor (props:UploadImageDialogComponentProps) {
    super(props);
    this.state = {
      name: "",
      imageUploadUrl: null,
      imageDataUrl: null,
      uploading: false,
      uploaded: false,
      progress: 0
    }
  }

  refs: {
    name: HTMLInputElement
    isPrivate: HTMLInputElement
  }

  handleFileChange =(e:React.ChangeEvent<HTMLInputElement>) => {
    const {files} = e.target
    if (files) {
      const file = files[0]
      const [type, ...rest] = file.type.split("/")
      if (type === "image") {
        this.setState({uploading: true, uploaded: false, name: file.name})
        const uploadPath = getUploadsStoragePath(this.props.offering, uuidV4())
        const uploadTask = firebase.storage().ref(uploadPath).put(file)
        uploadTask.on("state_changed", (snapshot:any) => {
          this.setState({progress: (snapshot.bytesTransferred / snapshot.totalBytes) * 100})
        }, (error) => {
          this.setState({uploading: false})
          alert(`Upload error! ${error.toString()}`)
        }, () => {
          this.setState({uploading: false, uploaded: true})
          this.setState({imageUploadUrl: uploadTask.snapshot.downloadURL})

          const reader = new FileReader()
          reader.addEventListener("load", () => {
            this.setState({imageDataUrl: reader.result})
          })
          reader.readAsDataURL(file)
        })
      }
      else {
        alert("You are only allowed to upload images.")
      }
   }
  }

  handleAddToCollaborationSpaceButton = () => {
    const name = this.refs.name.value.trim()
    const {imageUploadUrl} = this.state
    if (imageUploadUrl) {
      const isPrivate = this.refs.isPrivate ? this.refs.isPrivate.checked : false
      this.props.onAddUploadedImage(name, imageUploadUrl, isPrivate)
    }
  }

  handleNameChange = () => {
    this.setState({name: this.refs.name.value})
  }

  handleCancelButton = () => {
    this.props.onCancelUploadedImage()
  }

  renderPlaceholder() {
    const className = `upload-image-dialog-placeholder${this.state.uploaded ? " uploaded" : ""}`
    return (
      <div className={className}>
        {this.state.imageDataUrl ? <img src={this.state.imageDataUrl} /> : "Image preview..."}
      </div>
    )
  }

  renderBeforeUploadForm() {
    if (this.state.uploaded) {
      return null
    }
    if (this.state.uploading) {
      return "Uploading..."
    }
    return (
      <div>
        <div>
          <input type="file" onChange={this.handleFileChange} />
        </div>
        <div>
          <strong>Remember:</strong> do <u>not</u> upload images with personally identifiable information.
        </div>
        <div className="upload-image-buttons">
          <button type="button" onClick={this.handleCancelButton}>Cancel</button>
        </div>
      </div>
    )
  }

  renderVisbilityOptions() {
    if (!this.props.enableVisibilityOptions) {
      return null
    }

    return (
      <div>
        <label htmlFor="windowType">Visibility</label>
        <input type="radio" name="windowType" value="public" defaultChecked /> Public
        <input type="radio" name="windowType" value="private" ref="isPrivate" /> Private
      </div>
    )
  }

  renderAfterUploadForm() {
    if (!this.state.uploaded) {
      return null
    }
    const {imageUploadUrl, name} = this.state
    const addButtonDisabled = !this.state.imageUploadUrl || (name.trim().length == 0)
    return (
      <div>
        <div>
          <label htmlFor="upload_name">Name</label>
          <input type="text" id="upload_name" ref="name" placeholder="Name of uploaded image" onChange={this.handleNameChange} value={this.state.name} />
        </div>
        {this.renderVisbilityOptions()}
        <div className="upload-image-buttons">
          <button type="button" onClick={this.handleAddToCollaborationSpaceButton} disabled={addButtonDisabled}>Add</button>
          <button type="button" onClick={this.handleCancelButton}>Cancel</button>
        </div>
      </div>
    )
  }

  renderForm() {
    return (
      <div className="upload-image-dialog-form">
        {this.renderBeforeUploadForm()}
        {this.renderAfterUploadForm()}
      </div>
    )
  }

  render() {
    return (
      <div className="upload-image">
        <div className="upload-image-background" />
        <div className="upload-image-form">
          <div className="upload-image-dialog">
            <div className="upload-image-dialog-titlebar">
              <div className="upload-image-dialog-titlebar-title">Upload Image</div>
            </div>
            {this.renderPlaceholder()}
            {this.renderForm()}
          </div>
        </div>
      </div>
    )
  }
}
