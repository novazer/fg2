import {Component, Input, OnInit} from '@angular/core';
import {ModalController} from '@ionic/angular';

export type DiaryEntry = {
  message?: string;
  title: string;
  time: Date;
  category: string;
  data?: {
    co2FillingRest?: number;
    co2FillingInitial?: number;
  },
  images?: string[];
};

export const defaultDiaryEntries : Record<string, Partial<DiaryEntry>> = {
  'co2-refill': {
    title: 'CO2 cylinder was refilled',
  },
}

@Component({
  selector: 'app-diary-entry-modal',
  templateUrl: './diary-entry-modal.component.html',
  styleUrls: ['./diary-entry-modal.component.scss'],
})
export class DiaryEntryModalComponent implements OnInit {
  @Input() entry: DiaryEntry | undefined;

  public message = '';
  public title = ''
  public time = new Date().toISOString();
  public category = '';
  public data = {
    co2FillingRest: 0,
    co2FillingInitial: 425,
  };
  public images: string[] = [];

  constructor(private modalController: ModalController) {
  }

  ngOnInit() {
    this.message = this.entry?.message || '';
    this.title = this.entry?.title || '';
    this.time = this.entry?.time ? this.entry.time.toISOString() : new Date().toISOString();
    this.category = this.entry?.category || '';
    this.data.co2FillingRest = this.entry?.data?.co2FillingRest || 0;
    this.data.co2FillingInitial = this.entry?.data?.co2FillingInitial || 425;
    this.images = this.entry?.images ? this.entry.images : [];
  }

  cancel() {
    if (confirm('You have unsaved changes. Are you sure you want to discard them?')) {
      void this.modalController.dismiss(undefined, 'cancel');
    }
  }

  save() {
    const data: DiaryEntry = {
      message: this.message,
      title: this.title,
      time: new Date(this.time),
      category: this.category,
      data: this.data,
      images: this.images,
      ...(defaultDiaryEntries[this.category] || {})
    };

    void this.modalController.dismiss(data, 'save');
  }

  isFieldEditable(field: keyof (DiaryEntry & DiaryEntry['data'])) {
    if (!this.category) {
      return false;
    }

    return !defaultDiaryEntries[this.category]?.[field as keyof DiaryEntry] && !defaultDiaryEntries[this.category]?.data?.[field as keyof DiaryEntry['data']];
  }

  isValid() {
    return this.category && (!this.isFieldEditable('title') || this.title);
  }
}
