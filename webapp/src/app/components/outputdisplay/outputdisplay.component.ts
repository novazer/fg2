import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-outputdisplay',
  templateUrl: './outputdisplay.component.html',
  styleUrls: ['./outputdisplay.component.scss'],
})
export class OutputdisplayComponent implements OnInit {

  @Input() public measurement = 0;
  @Input() public unit = 0;

  constructor() { }

  ngOnInit() {}

}
