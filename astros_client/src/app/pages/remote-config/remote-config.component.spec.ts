import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RemoteConfigComponent } from './remote-config.component';

describe('RemoteConfigComponent', () => {
  let component: RemoteConfigComponent;
  let fixture: ComponentFixture<RemoteConfigComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RemoteConfigComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RemoteConfigComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
