import { Component, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'dsgvo-modal-page',
  templateUrl: './dsgvo.page.html',
})
export class DsgvoModalPage {
    constructor(public modalController: ModalController) {}

  dismiss() {
    // using the injected ModalController this page
    // can "dismiss" itself and optionally pass back data
    this.modalController.dismiss({
      'dismissed': true
    });
  }
}
