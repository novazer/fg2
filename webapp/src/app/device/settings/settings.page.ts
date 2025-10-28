import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { combineLatest } from 'rxjs';
import { DataService } from 'src/app/services/data.service';
import { Device, DeviceService } from 'src/app/services/devices.service';



@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage implements OnInit {
  public device_id:string = "";
  public device_type:string = ""

  constructor(
    private devices: DeviceService,
    public data: DataService,
    private route: ActivatedRoute,
    private translate: TranslateService
  ) {

  }

  async ngOnInit() {
    this.device_id = this.route.snapshot.paramMap.get('device_id') || "";
    this.devices.devices.subscribe((devices) => {
      this.device_type = devices.find((device) => device.device_id == this.device_id)?.device_type || '';
    })
  }
}
