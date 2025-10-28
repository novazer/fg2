import { Component, OnInit } from '@angular/core';
import { DeviceAdminService } from '../services/devices.service';

@Component({
  selector: 'app-classes',
  templateUrl: './classes.page.html',
  styleUrls: ['./classes.page.scss'],
})
export class ClassesPage implements OnInit {

  constructor(private device: DeviceAdminService) { }

  public classes: any;

  ngOnInit() {
    this.device.device_classes.subscribe((classes) => {
      this.classes = classes
    })
  }

  async rollout(cls:any, firmware:any) {
    if(confirm("roll out " + firmware + " on " + cls.name + "?")) {
      await this.device.updateClass(cls.class_id, cls.name, cls.description, cls.concurrent, cls.maxfails, firmware)
      await this.device.fetch()
    }
  }

  async updateClass(cls:any) {
    await this.device.updateClass(cls.class_id, cls.name, cls.description, cls.concurrent, cls.maxfails, cls.firmware_id)
    await this.device.fetch()
  }

}
