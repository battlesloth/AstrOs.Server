import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MaestroChannelComponent } from './maestro-channel.component';

describe('MaestroChannelComponent', () => {
  let component: MaestroChannelComponent;
  let fixture: ComponentFixture<MaestroChannelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MaestroChannelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MaestroChannelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
