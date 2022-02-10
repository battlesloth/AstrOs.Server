import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AudioFilesComponent } from './audio-files.component';

describe('AudioFilesComponent', () => {
  let component: AudioFilesComponent;
  let fixture: ComponentFixture<AudioFilesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ AudioFilesComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(AudioFilesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
