import {Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output} from "@angular/core";
import {ToastController} from "@ionic/angular";
import {DeviceService} from "../../services/devices.service";
import {Router} from "@angular/router";

@Component({
  selector: 'cloud-settings',
  templateUrl: './cloud-settings.component.html',
  styleUrls: ['./cloud-settings.component.scss'],
})
export class CloudSettingsComponent {
  @Input() cloudSettings: any;

  @Input() deviceId: string = '';

  @Output() cloudSettingsChange = new EventEmitter<any>();

  constructor(private toastController: ToastController, private devices: DeviceService, private router: Router) {}

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

  async deleteDevice() {
    if (confirm('Are you sure you want to delete this device? This action cannot be undone.')) {
      if (confirm('This is your last chance to back out. Do you really want to delete this device?')) {
        await this.devices.unclaim(this.deviceId);
        await this.router.navigateByUrl('/list', { replaceUrl: true });
      }
    }
  }
}
