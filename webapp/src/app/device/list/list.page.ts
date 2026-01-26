import { Component, OnInit } from '@angular/core';
import { DataService } from 'src/app/services/data.service';
import { Device, DeviceService } from 'src/app/services/devices.service';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
})
export class ListPage implements OnInit {


  public all_devices:Device[] = [];
  public id:string = '';

  private reloaded = false;

  constructor(private deviceService: DeviceService, public data: DataService) { }

  ngOnInit(): void {
    this.deviceService.devices.subscribe(devices => {
      if (devices.length <= 0 && !this.reloaded) {
        this.reloaded = true;
        setTimeout(() => {
          if (!this.all_devices?.length) {
            void this.deviceService.refetchDevices()
          }
        }, 2000);
      } else {
        this.reloaded = false;
        this.all_devices = devices;
      }
    });
  }

  claimDevice() {
    this.deviceService.claim(this.id.toUpperCase());
  }
}
