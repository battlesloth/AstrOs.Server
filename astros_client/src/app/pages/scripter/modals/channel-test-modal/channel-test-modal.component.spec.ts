import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChannelTestModalComponent } from './channel-test-modal.component';

describe('ChannelTestModalComponent', () => {
  let component: ChannelTestModalComponent;
  let fixture: ComponentFixture<ChannelTestModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ChannelTestModalComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ChannelTestModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
