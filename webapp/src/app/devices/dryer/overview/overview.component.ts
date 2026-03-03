import { Component, ElementRef, Input, OnInit, Renderer2, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonModal } from '@ionic/angular';
import { combineLatest } from 'rxjs';
import { DataService } from 'src/app/services/data.service';
import { Device, DeviceService } from 'src/app/services/devices.service';
import TimeAgo from 'javascript-time-ago'

// English.
import en from 'javascript-time-ago/locale/en'
TimeAgo.addDefaultLocale(en)
// Create formatter (English).
const timeAgo = new TimeAgo('en-US')

@Component({
  selector: 'dryer-overview',
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.scss'],
})
export class DryerOverviewComponent implements OnInit {

  public vpd:number = 0;
  @Input() device_id:string = "";
  @Input() device_name:string = "";
  @Input() cloud_settings:any = {};
  @ViewChild("nameedit", { read: ElementRef }) private nameInput: ElementRef | undefined;

  public logs:any;
  public t_l:number = NaN;
  public t_h:number = NaN;
  public r_l:number = NaN;
  public r_h:number = NaN;
  public co2_l:number = NaN;
  public co2_h:number = NaN;
  public config:any;
  public has_logs:boolean = false;
  public severity:number = 0;
  public device_online = false;
  public showDeviceLog:boolean = false;
  public editingName:boolean = false;

  constructor(private devices: DeviceService, public data: DataService, private route: ActivatedRoute, private renderer: Renderer2) { }

  editName() {
    this.editingName = true;
    this.renderer.setStyle(this.nameInput?.nativeElement, 'display', 'block')
    this.renderer.selectRootElement(this.nameInput?.nativeElement);
    this.nameInput?.nativeElement.focus()
    //this.nameInput?.nativeElement.setFocus();
  }

  doneEdit() {
    this.editingName = false;
    this.renderer.setStyle(this.nameInput?.nativeElement, 'display', 'none')
    this.devices.setName(this.device_id, this.device_name)
  }

  async ngOnInit() {
    if(this.device_name == "" || this.device_name == undefined) {
      this.device_name = "Plantalytix Fridge Dry"
    }
    combineLatest([
      this.data.measure(this.device_id, 'temperature'),
      this.data.measure(this.device_id, 'humidity')
    ]).subscribe(([temp, rh]) => {
      var es = 0.6108 * Math.exp(17.27 * temp / (rh + 237.3));
      var ea = rh / 100.0 * es;
      this.vpd = (es - ea) * 1000;

      if(isNaN(this.vpd)) {
        this.device_online = false;
      }
      else {
        this.device_online = true;
      }
    })

    this.logs = await this.devices.getLogs(this.device_id);
    for(let log of this.logs) {
      log.time = timeAgo.format(new Date(log.time))
    }

    this.config = await this.devices.getConfig(this.device_id);


    if(this.logs.length) {
      this.has_logs = true;
    }
    else {
      this.has_logs = false;
    }
    this.severity = Math.max(...this.logs.map((o: { severity: number; }) => {return isNaN(o.severity) ? 0 : o.severity}))
  }

  @ViewChild(IonModal) modal!: IonModal;


  showLogs() {
    console.log(this.showDeviceLog)
    this.showDeviceLog = true;
  }

  clearLogs() {
    this.devices.clearLogs(this.device_id);
    this.logs = [];
    this.has_logs = false;
  }
}
