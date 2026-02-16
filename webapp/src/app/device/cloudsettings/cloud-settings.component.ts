import {Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output} from "@angular/core";
import {ToastController} from "@ionic/angular";

@Component({
  selector: 'cloud-settings',
  templateUrl: './cloud-settings.component.html',
  styleUrls: ['./cloud-settings.component.scss'],
})
export class CloudSettingsComponent {
  @Input() cloudSettings: any;

  @Output() cloudSettingsChange = new EventEmitter<any>();

  constructor(private toastController: ToastController) {}

  async onFirmwareUpdateChanged() {
    if (this.cloudSettings.autoFirmwareUpdate && this.cloudSettings.betaFeatures) {
      const toast = await this.toastController.create({
        message: 'Caution: After saving, your module will automatically update to the latest beta firmware',
        duration: 10000,
        position: 'top',
      });
      await toast.present();
    }
  }
}
