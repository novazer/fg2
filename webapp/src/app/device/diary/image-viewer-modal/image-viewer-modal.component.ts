import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-image-viewer-modal',
  templateUrl: './image-viewer-modal.component.html',
  styleUrls: ['./image-viewer-modal.component.scss'],
})
export class ImageViewerModalComponent implements OnInit {
  @Input() imageUrls: string[] = [];
  @Input() startIndex = 0;

  public imageIndex = 0;

  constructor(private modalController: ModalController) {}

  ngOnInit(): void {
    if (this.imageUrls.length === 0) {
      this.imageIndex = 0;
      return;
    }

    this.imageIndex = Math.min(Math.max(this.startIndex, 0), this.imageUrls.length - 1);
  }

  close(): void {
    void this.modalController.dismiss();
  }

  showPreviousImage(): void {
    if (this.imageUrls.length < 2) {
      return;
    }

    this.imageIndex = (this.imageIndex - 1 + this.imageUrls.length) % this.imageUrls.length;
  }

  showNextImage(): void {
    if (this.imageUrls.length < 2) {
      return;
    }

    this.imageIndex = (this.imageIndex + 1) % this.imageUrls.length;
  }

  get currentImageUrl(): string {
    return this.imageUrls[this.imageIndex] || '';
  }
}

